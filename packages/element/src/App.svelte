<script lang="ts">
  import { onMount, untrack } from "svelte";
  import { setCcSession, type StorageLike } from "@somewhatintelligent/cc-ws-svelte";
  import { createSession, type PersistMode } from "./lib/session.svelte";
  import { installKeymap } from "./lib/keymap";
  import { createSessionHistory, setSessionHistory } from "./lib/sessionHistory.svelte";
  import { ui, openPanel } from "./lib/ui.svelte";
  import Header from "./components/Header.svelte";
  import MessageStream from "./components/MessageStream.svelte";
  import Composer from "./components/Composer.svelte";
  import StatusFooter from "./components/StatusFooter.svelte";
  import PanelHost from "./components/panels/PanelHost.svelte";

  let {
    wsUrl,
    persist,
    storageKey,
    customStorage,
    initialState,
    onSnapshot,
    installKeybinds = true,
  }: {
    wsUrl?: string;
    persist?: PersistMode;
    storageKey?: string;
    customStorage?: StorageLike;
    initialState?: string;
    onSnapshot?: (snapshot: string) => void;
    installKeybinds?: boolean;
  } = $props();

  // Construct the session inside the component so each App instance is
  // self-contained — embedding two <cc-ws-chat> elements on one page
  // gives each its own bridge connection + persistence + atoms. Read
  // props via untrack: we capture the values at mount time on purpose
  // and don't react to subsequent prop changes (would be a session swap,
  // not what consumers usually mean).
  const bootstrap = createSession({
    wsUrl: untrack(() => wsUrl),
    persist: untrack(() => persist),
    storageKey: untrack(() => storageKey),
    customStorage: untrack(() => customStorage),
    initialState: untrack(() => initialState),
    onSnapshot: untrack(() => onSnapshot),
  });
  const session = bootstrap.session;
  setCcSession(session);

  const history = createSessionHistory(bootstrap.storage, bootstrap.storageKey);
  setSessionHistory(history);

  const { pendingPermissions } = session.atoms;

  // Pop the permissions panel when a new request arrives, only if no
  // panel is open and the user hasn't disabled the auto-pop.
  let lastPendCount = $state(0);
  $effect(() => {
    const n = $pendingPermissions.length;
    if (n > lastPendCount && ui.autoOpenPerms && ui.activePanel == null) {
      openPanel("permissions");
    }
    lastPendCount = n;
  });

  onMount(() => {
    const offHist = history.install(session);
    const offKey = installKeybinds ? installKeymap(session) : () => {};
    return () => {
      offHist();
      offKey();
      session.disconnect();
    };
  });
</script>

<Header />
<MessageStream />
<Composer />
<StatusFooter />
<PanelHost />
