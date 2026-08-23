/**
 * In-Obsidian confirmation modal for bridge write requests.
 *
 * Every mutation from the DSH side must be reviewed and approved here before
 * it reaches the vault. The modal shows a human-readable preview and records
 * the decision by calling back into the bridge, which confirms or discards the
 * pending write on the loopback server.
 */

import type { App} from 'obsidian';
import { Modal, Notice, Setting } from 'obsidian';

import type { VaultApiBridge } from './VaultApiBridge';
import type { PendingWriteRequest } from './VaultApiServer';

const METHOD_LABELS: Record<string, string> = {
  'vault.write': 'Write note',
  'vault.append': 'Append to note',
  'vault.delete': 'Delete note',
  'vault.move': 'Move/rename note',
  'vault.frontmatter.set': 'Set frontmatter field',
  'vault.frontmatter.delete': 'Delete frontmatter field',
};

export class VaultApiConfirmModal extends Modal {
  private decision = false;

  constructor(
    app: App,
    private readonly request: PendingWriteRequest,
    private readonly bridge: VaultApiBridge,
  ) {
    super(app);
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('claudian-vault-confirm');

    contentEl.createEl('h3', {
      text: `DSH wants to ${METHOD_LABELS[this.request.method] ?? this.request.method}`,
    });

    const pathEl = contentEl.createDiv({ cls: 'claudian-vault-confirm-path' });
    pathEl.setText(this.request.path || '(vault root)');

    const previewEl = contentEl.createEl('pre', { cls: 'claudian-vault-confirm-preview' });
    previewEl.setText(this.request.preview);

    const originEl = contentEl.createDiv({ cls: 'claudian-vault-confirm-origin' });
    originEl.setText(`Source request: ${this.request.rpcId}`);

    new Setting(contentEl)
      .setName('Approve this change?')
      .setDesc('The change is written to your vault only after approval.')
      .addButton((approve) => approve
        .setButtonText('Approve')
        .setCta()
        .onClick(() => {
          this.decision = true;
          this.close();
        }))
      .addButton((reject) => reject
        .setButtonText('Reject')
        .onClick(() => {
          this.decision = false;
          this.close();
        }));
  }

  onClose(): void {
    const { contentEl } = this;
    contentEl.empty();
    void this.bridge.confirm(this.request.confirmId, this.decision)
      .then((result) => {
        const ok = (result as { ok?: boolean })?.ok ?? false;
        new Notice(
          this.decision
            ? (ok ? 'DSH write approved and applied.' : `DSH write failed: ${String((result as { error?: { message?: string } })?.error?.message ?? 'unknown')}`)
            : 'DSH write rejected.',
        );
      })
      .catch(() => {
        new Notice('Could not confirm the DSH write.');
      });
  }
}
