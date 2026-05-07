<script lang="ts">
  import { modeColor, modeGlyph, modeShort } from "../../lib/modes";

  let { mode }: { mode: string } = $props();
</script>

<div class="row" style:color={modeColor(mode)}>
  <span class="glyph">{modeGlyph(mode)}</span>
  <span class="dim">permission mode</span>
  <span class="arrow">→</span>
  <span class="mode">{modeShort(mode)}</span>
</div>

<style>
  .row {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 11px;
    padding: 1px 0;
  }
  .glyph {
    font-size: 13px;
    line-height: 1;
    flex-shrink: 0;
  }
  .dim { color: var(--fg-2); }
  .arrow { color: var(--fg-3); }
  .mode {
    font-weight: 600;
    color: inherit;
  }
</style>
