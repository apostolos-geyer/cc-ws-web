<script lang="ts">
  import { onMount } from "svelte";
  import { setCcSession } from "@somewhatintelligent/cc-ws-svelte";
  import { session } from "./lib/session.svelte";
  import { installKeymap } from "./lib/keymap";
  import { installSessionTracker } from "./lib/sessionHistory.svelte";
  import { ui, openPanel } from "./lib/ui.svelte";
  import Header from "./components/Header.svelte";
  import MessageStream from "./components/MessageStream.svelte";
  import Composer from "./components/Composer.svelte";
  import StatusFooter from "./components/StatusFooter.svelte";
  import PanelHost from "./components/panels/PanelHost.svelte";

  setCcSession(session);

  const { pendingPermissions } = session.atoms;

  // Auto-pop the permissions panel when a new request arrives, but only if
  // no other panel is open and the user hasn't disabled it. The flag stays
  // armed once the user clears the queue.
  let lastPendCount = $state(0);
  $effect(() => {
    const n = $pendingPermissions.length;
    if (n > lastPendCount && ui.autoOpenPerms && ui.activePanel == null) {
      openPanel("permissions");
    }
    lastPendCount = n;
  });

  onMount(() => {
    const offKey = installKeymap(session);
    const offHist = installSessionTracker(session);
    return () => {
      offKey();
      offHist();
    };
  });
</script>

<Header />
<MessageStream />
<Composer />
<StatusFooter />
<PanelHost />
