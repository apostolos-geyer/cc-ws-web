<script lang="ts">
  import { saveSetup } from "./stores/setup";
  import type { Setup } from "../src/setup-flow";

  // Local form state — written into the store atomically on submit.
  // No partial persistence between mounts; if the user reloads mid-form the
  // form clears, which is fine for a demo and avoids stale-credentials gotchas.

  let claudeKind: "oauth" | "api-key" = $state("oauth");
  let claudeValue = $state("");
  let useGithub = $state(false);
  let repoUrl = $state("");
  let githubPat = $state("");
  let useCustomGitIdentity = $state(false);
  let gitUserName = $state("");
  let gitUserEmail = $state("");

  let submitError = $state<string | null>(null);

  function submit(e: SubmitEvent) {
    e.preventDefault();
    submitError = null;

    if (!claudeValue.trim()) {
      submitError = "Claude credential is required.";
      return;
    }
    if (useGithub) {
      if (!githubPat.trim()) {
        submitError = "GitHub PAT is required when a repo URL is set.";
        return;
      }
      if (!repoUrl.trim().startsWith("https://github.com/")) {
        submitError = "Repo URL must be https://github.com/...";
        return;
      }
    }

    const setup: Setup = {
      claude: { kind: claudeKind, value: claudeValue.trim() },
      ...(useGithub
        ? { github: { pat: githubPat.trim(), repoUrl: repoUrl.trim() } }
        : {}),
      ...(useCustomGitIdentity
        ? { git: { userName: gitUserName.trim(), userEmail: gitUserEmail.trim() } }
        : {}),
    };
    saveSetup(setup);
  }
</script>

<form onsubmit={submit}>
  <h1>cc-ws · cloudflare sandbox demo</h1>
  <p class="hint">
    All credentials stay in your browser (localStorage). The Claude token is
    injected per-session into the sandbox env. The GitHub PAT is intercepted
    at the Worker boundary and injected into <code>git</code>'s HTTPS
    requests — it never touches the container.
  </p>

  <fieldset>
    <legend>Claude credential</legend>
    <label>
      <input type="radio" bind:group={claudeKind} value="oauth" />
      OAuth token (<code>CLAUDE_CODE_OAUTH_TOKEN</code>)
    </label>
    <label>
      <input type="radio" bind:group={claudeKind} value="api-key" />
      API key (<code>ANTHROPIC_API_KEY</code>)
    </label>
    <label>
      <span>Value</span>
      <input type="password" bind:value={claudeValue} autocomplete="off" required />
    </label>
  </fieldset>

  <fieldset>
    <legend>
      <label>
        <input type="checkbox" bind:checked={useGithub} />
        Clone a GitHub repo into the sandbox
      </label>
    </legend>
    {#if useGithub}
      <label>
        <span>Repo URL</span>
        <input type="url" bind:value={repoUrl} placeholder="https://github.com/owner/repo.git" required />
      </label>
      <label>
        <span>GitHub PAT</span>
        <input type="password" bind:value={githubPat} autocomplete="off" required />
      </label>
    {/if}
  </fieldset>

  <fieldset>
    <legend>
      <label>
        <input type="checkbox" bind:checked={useCustomGitIdentity} />
        Custom git identity (otherwise <code>claude / claude@local</code>)
      </label>
    </legend>
    {#if useCustomGitIdentity}
      <label>
        <span>user.name</span>
        <input type="text" bind:value={gitUserName} required />
      </label>
      <label>
        <span>user.email</span>
        <input type="email" bind:value={gitUserEmail} required />
      </label>
    {/if}
  </fieldset>

  {#if submitError}
    <p class="error">{submitError}</p>
  {/if}

  <button type="submit">Save &amp; start session</button>
</form>

<style>
  form {
    max-width: 560px;
    margin: 4rem auto;
    padding: 2rem;
    background: #161618;
    border: 1px solid #2a2a2d;
    border-radius: 10px;
    font-size: 14px;
  }
  h1 {
    margin: 0 0 0.5rem;
    font-size: 1.25rem;
    font-weight: 600;
  }
  .hint {
    color: #9a9a9f;
    line-height: 1.5;
    margin: 0 0 1.5rem;
  }
  fieldset {
    border: 1px solid #2a2a2d;
    border-radius: 6px;
    margin: 0 0 1rem;
    padding: 0.75rem 1rem 1rem;
  }
  legend {
    padding: 0 0.4rem;
    font-weight: 500;
  }
  legend label {
    display: inline;
    margin: 0;
  }
  label {
    display: block;
    margin: 0.5rem 0;
  }
  label > span {
    display: block;
    color: #c4c4c8;
    margin-bottom: 0.2rem;
  }
  input[type="text"],
  input[type="email"],
  input[type="url"],
  input[type="password"] {
    width: 100%;
    padding: 0.4rem 0.5rem;
    background: #0d0d0e;
    border: 1px solid #2a2a2d;
    border-radius: 4px;
    color: #e6e6e6;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    box-sizing: border-box;
  }
  input[type="radio"],
  input[type="checkbox"] {
    margin-right: 0.4rem;
  }
  code {
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    color: #d0d0d4;
    font-size: 0.9em;
  }
  .error {
    color: #f87171;
    margin: 0.5rem 0;
  }
  button {
    width: 100%;
    padding: 0.6rem;
    background: #2f6feb;
    border: 0;
    border-radius: 4px;
    color: white;
    font-weight: 500;
    cursor: pointer;
  }
  button:hover {
    background: #3b7bf4;
  }
</style>
