<script lang="ts">
	import { Upload, File as FileIcon, X } from '@lucide/svelte';
	import { SvelteMap, SvelteSet } from 'svelte/reactivity';
	import Modal from './Modal.svelte';

	// ==================== I18n Types ====================
	interface FileUploadI18n {
		title?: string;
		dropFile?: string;
		supportedFormats?: string;
		chooseFile?: string;
		removeFile?: string;
		errorUnsupportedFormat?: string;
		errorEmptyFile?: string;
		errorAllLabelsAssigned?: string;
		errorIncompleteSelection?: string;
		generatedColumn?: string;
		modeText?: string;
		modeTable?: string;
		processing?: string;
		previewTitle?: string;
		selectSingleColumnHint?: string;
		selectColumnsHint?: string;
		clickToSelect?: string;
		clickToDeselect?: string;
		clickToChange?: string;
		clickToCycle?: string;
		showingFirstRows?: string;
		cancel?: string;
		confirm?: string;
	}

	interface Props {
		open: boolean;
		columnCount?: number; // Number of columns to select (0=plain text, 1+=table column selection)
		columnLabels?: string[]; // Column labels, e.g., ['Address', 'Amount']
		i18n?: FileUploadI18n;
		onClose: () => void;
		onConfirm: (content: string) => void;
	}

	const defaultI18n: Required<FileUploadI18n> = {
		title: 'Upload File',
		dropFile: 'Drop file here or click to upload',
		supportedFormats: 'Supports TXT, CSV, XLSX formats',
		chooseFile: 'Choose File',
		removeFile: 'Remove file',
		errorUnsupportedFormat: 'Unsupported file format',
		errorEmptyFile: 'File is empty',
		errorAllLabelsAssigned: 'All labels have been assigned',
		errorIncompleteSelection: 'Please select all required columns',
		generatedColumn: 'Column {index}',
		modeText: 'Text Mode',
		modeTable: 'Table Mode',
		processing: 'Processing...',
		previewTitle: 'Preview',
		selectSingleColumnHint: 'Click to select the column for {label}',
		selectColumnsHint: 'Click column headers to assign {count} labels',
		clickToSelect: 'Click to select as {label}',
		clickToDeselect: 'Click to deselect',
		clickToChange: 'Click to change selection',
		clickToCycle: 'Click to cycle label',
		showingFirstRows: 'Showing first {count} rows',
		cancel: 'Cancel',
		confirm: 'Confirm'
	};

	let { open, columnCount = 0, columnLabels = [], i18n = {}, onClose, onConfirm }: Props = $props();

	const t = $derived({ ...defaultI18n, ...i18n });

	// File upload state
	let isDragging = $state(false);
	let uploadedFile = $state<File | null>(null);
	let fileContent = $state('');
	let isProcessing = $state(false);
	let error = $state('');
	let parseMode = $state<'text' | 'table'>('text');

	// Table data state
	let tableHeaders = $state<string[]>([]);
	let tableRows = $state<string[][]>([]);
	let selectedColumns = new SvelteMap<number, number>();

	// Preview limit
	const PREVIEW_ROWS = 10;

	// Reset state when modal opens/closes
	$effect(() => {
		if (!open) {
			resetState();
		}
	});

	function resetState() {
		uploadedFile = null;
		fileContent = '';
		isProcessing = false;
		error = '';
		parseMode = 'text';
		tableHeaders = [];
		tableRows = [];
		selectedColumns = new SvelteMap();
		isDragging = false;
	}

	function handleDragOver(e: DragEvent) {
		e.preventDefault();
		isDragging = true;
	}

	function handleDragLeave(e: DragEvent) {
		e.preventDefault();
		isDragging = false;
	}

	async function handleDrop(e: DragEvent) {
		e.preventDefault();
		isDragging = false;

		const files = e.dataTransfer?.files;
		if (files && files.length > 0) {
			await processFile(files[0]);
		}
	}

	async function handleFileInput(e: Event) {
		const input = e.target as HTMLInputElement;
		const files = input.files;
		if (files && files.length > 0) {
			await processFile(files[0]);
		}
	}

	async function processFile(file: File) {
		uploadedFile = file;
		isProcessing = true;
		error = '';

		try {
			const ext = file.name.split('.').pop()?.toLowerCase();

			if (ext === 'txt') {
				await processTextFile(file);
			} else if (ext === 'csv') {
				await processCsvFile(file);
			} else if (ext === 'xlsx' || ext === 'xls') {
				await processExcelFile(file);
			} else {
				error = t.errorUnsupportedFormat;
			}
		} catch (err) {
			error = err instanceof Error ? err.message : String(err);
		} finally {
			isProcessing = false;
		}
	}

	async function processTextFile(file: File) {
		const text = await file.text();
		fileContent = text;

		const lines = text.split('\n').filter((line) => line.trim());
		if (lines.length === 0) {
			throw new Error(t.errorEmptyFile);
		}

		if (parseMode === 'table' || columnCount >= 2) {
			await parseAsTable(text);
		}
	}

	async function parseAsTable(text: string) {
		const lines = text.split('\n').filter((line) => line.trim());

		// Detect delimiter
		const delimiters = [',', '\t', ' ', '|', ';'];
		let bestDelimiter = ',';
		let maxColumns = 0;

		for (const delimiter of delimiters) {
			const firstLineColumns = lines[0].split(delimiter).length;
			if (firstLineColumns > maxColumns) {
				maxColumns = firstLineColumns;
				bestDelimiter = delimiter;
			}
		}

		const Papa = await import('papaparse');
		const result = Papa.parse(text, {
			delimiter: bestDelimiter,
			skipEmptyLines: true
		});

		if (result.data.length > 0) {
			const firstRow = result.data[0] as string[];

			const hasHeader = firstRow.some(
				(cell) => cell && isNaN(Number(cell)) && cell.trim().length > 0
			);

			if (hasHeader) {
				tableHeaders = firstRow.map((h) => String(h || ''));
				tableRows = result.data.slice(1, PREVIEW_ROWS + 1) as string[][];
			} else {
				tableHeaders = firstRow.map((_cell, i) =>
					t.generatedColumn.replace('{index}', String(i + 1))
				);
				tableRows = result.data.slice(0, PREVIEW_ROWS) as string[][];
			}

			fileContent = result.data.map((row) => (Array.isArray(row) ? row.join(',') : row)).join('\n');
		}
	}

	async function processCsvFile(file: File) {
		const Papa = await import('papaparse');

		const text = await file.text();
		fileContent = text;

		if (parseMode === 'table' || columnCount > 0) {
			const result = Papa.parse(text, {
				header: true,
				skipEmptyLines: true
			});

			if (result.errors.length > 0) {
				throw new Error(result.errors[0].message);
			}

			tableHeaders = result.meta.fields || [];
			tableRows = (result.data as Record<string, string>[])
				.slice(0, PREVIEW_ROWS)
				.map((row) => tableHeaders.map((header) => row[header] || ''));

			fileContent = Papa.unparse(result.data);
		}
	}

	async function processExcelFile(file: File) {
		const XLSX = await import('xlsx');

		const arrayBuffer = await file.arrayBuffer();
		const workbook = XLSX.read(arrayBuffer, { type: 'array' });

		const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
		const jsonData = XLSX.utils.sheet_to_json(firstSheet, { header: 1 }) as string[][];

		if (jsonData.length === 0) {
			throw new Error(t.errorEmptyFile);
		}

		if (parseMode === 'table' || columnCount > 0) {
			const firstRow = jsonData[0];
			const hasHeader = firstRow.some(
				(cell) => cell && isNaN(Number(cell)) && String(cell).trim().length > 0
			);

			if (hasHeader) {
				tableHeaders = firstRow.map((h) => String(h || ''));
				tableRows = jsonData.slice(1, PREVIEW_ROWS + 1);
			} else {
				tableHeaders = firstRow.map((_cell, i) =>
					t.generatedColumn.replace('{index}', String(i + 1))
				);
				tableRows = jsonData.slice(0, PREVIEW_ROWS);
			}
		}

		const fullData = jsonData.slice(1);
		fileContent = fullData.map((row) => row.join(',')).join('\n');
	}

	async function handleParseModeChange(mode: 'text' | 'table') {
		parseMode = mode;
		tableHeaders = [];
		tableRows = [];
		selectedColumns = new SvelteMap();

		if (uploadedFile && mode === 'table') {
			isProcessing = true;
			try {
				const ext = uploadedFile.name.split('.').pop()?.toLowerCase();
				if (ext === 'txt') {
					await parseAsTable(fileContent);
				} else if (ext === 'csv') {
					await processCsvFile(uploadedFile);
				} else if (ext === 'xlsx' || ext === 'xls') {
					await processExcelFile(uploadedFile);
				}
			} catch (err) {
				error = err instanceof Error ? err.message : String(err);
			} finally {
				isProcessing = false;
			}
		}
	}

	function handleColumnClick(columnIndex: number) {
		const currentPosition = selectedColumns.get(columnIndex);

		if (currentPosition !== undefined) {
			const otherColumnsPositions = new SvelteSet<number>();
			for (const [colIdx, pos] of selectedColumns.entries()) {
				if (colIdx !== columnIndex) {
					otherColumnsPositions.add(pos);
				}
			}

			let nextPosition = currentPosition + 1;
			while (nextPosition <= columnCount && otherColumnsPositions.has(nextPosition)) {
				nextPosition++;
			}

			if (nextPosition > columnCount) {
				selectedColumns.delete(columnIndex);
			} else {
				selectedColumns.set(columnIndex, nextPosition);
			}
		} else {
			const assignedPositions = new Set(selectedColumns.values());
			let nextAvailable = 1;

			for (let i = 1; i <= columnCount; i++) {
				if (!assignedPositions.has(i)) {
					nextAvailable = i;
					break;
				}
			}

			if (assignedPositions.size >= columnCount) {
				error = t.errorAllLabelsAssigned;
				setTimeout(() => {
					error = '';
				}, 3000);
				return;
			}

			selectedColumns.set(columnIndex, nextAvailable);
		}
	}

	function getColumnPosition(columnIndex: number): number | null {
		const pos = selectedColumns.get(columnIndex);
		return pos !== undefined ? pos : null;
	}

	function isPositionAssigned(position: number): boolean {
		for (const pos of selectedColumns.values()) {
			if (pos === position) return true;
		}
		return false;
	}

	function generateOutputContent(): string {
		if (parseMode === 'text') {
			return fileContent;
		}

		const positions: number[] = [];
		for (let i = 1; i <= columnCount; i++) {
			positions.push(i);
		}

		const columnIndices: number[] = [];
		for (const pos of positions) {
			let foundColumnIndex = -1;
			for (const [colIdx, colPos] of selectedColumns.entries()) {
				if (colPos === pos) {
					foundColumnIndex = colIdx;
					break;
				}
			}
			if (foundColumnIndex === -1) {
				return '';
			}
			columnIndices.push(foundColumnIndex);
		}

		const lines = fileContent.split('\n').filter((line) => line.trim());
		const outputLines: string[] = [];

		for (const line of lines) {
			const cells = line.split(',').map((c) => c.trim());
			const selectedCells = columnIndices.map((idx) => cells[idx] || '');
			outputLines.push(selectedCells.join(','));
		}

		return outputLines.join('\n');
	}

	function handleConfirm() {
		const output = generateOutputContent();
		if (!output) {
			error = t.errorIncompleteSelection;
			return;
		}
		onConfirm(output);
		onClose();
	}

	function formatFileSize(bytes: number): string {
		if (bytes < 1024) return bytes + ' B';
		if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
		return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
	}

	let canConfirm = $derived.by(() => {
		if (!uploadedFile) return false;
		if (columnCount === 0 || parseMode === 'text') return true;
		if (selectedColumns.size !== columnCount) return false;
		for (let i = 1; i <= columnCount; i++) {
			if (!isPositionAssigned(i)) return false;
		}
		return true;
	});
</script>

<Modal {open} {onClose} title={t.title} maxWidth="800px">
	<div class="fu-container">
		{#if !uploadedFile}
			<!-- Upload area -->
			<div
				class="fu-area {isDragging ? 'fu-dragging' : ''}"
				ondragover={handleDragOver}
				ondragleave={handleDragLeave}
				ondrop={handleDrop}
				role="region"
				aria-label="File upload area"
			>
				<Upload size={48} />
				<p class="fu-text">{t.dropFile}</p>
				<p class="fu-hint">{t.supportedFormats}</p>
				<label class="fu-button">
					{t.chooseFile}
					<input type="file" accept=".txt,.csv,.xlsx,.xls" onchange={handleFileInput} />
				</label>
			</div>
		{:else}
			<!-- File info -->
			<div class="fu-file-info">
				<div class="fu-file-icon">
					<FileIcon size={24} />
				</div>
				<div class="fu-file-details">
					<div class="fu-file-name">{uploadedFile.name}</div>
					<div class="fu-file-size">{formatFileSize(uploadedFile.size)}</div>
				</div>
				<button class="fu-file-remove" onclick={resetState} title={t.removeFile}>
					<X size={16} />
				</button>
			</div>

			{#if error}
				<div class="fu-error">{error}</div>
			{/if}

			<!-- Parse Mode Switcher -->
			<div class="fu-mode-switcher">
				<button
					class="fu-mode-btn {parseMode === 'text' ? 'active' : ''}"
					onclick={() => handleParseModeChange('text')}
				>
					{t.modeText}
				</button>
				<button
					class="fu-mode-btn {parseMode === 'table' ? 'active' : ''}"
					onclick={() => handleParseModeChange('table')}
				>
					{t.modeTable}
				</button>
			</div>

			{#if isProcessing}
				<div class="fu-processing">{t.processing}</div>
			{:else if tableHeaders.length > 0 && parseMode === 'table'}
				<!-- Table preview -->
				<div class="fu-table-section">
					<div class="fu-section-title">{t.previewTitle}</div>

					<div class="fu-column-hint">
						{#if columnCount === 1 && columnLabels.length > 0}
							{t.selectSingleColumnHint.replace('{label}', columnLabels[0])}
						{:else}
							{t.selectColumnsHint.replace('{count}', String(columnCount))}
						{/if}
					</div>

					<div class="fu-table-wrapper">
						<table class="fu-table">
							<thead>
								<tr>
									{#each tableHeaders as header, colIndex (colIndex)}
										{@const currentPosition = getColumnPosition(colIndex)}
										<th
											class="fu-clickable {currentPosition ? 'fu-has-selection' : ''}"
											onclick={() => handleColumnClick(colIndex)}
										>
											<div class="fu-header-cell">
												<span class="fu-header-text">{header}</span>
												{#if currentPosition}
													<span class="fu-column-stamp">
														{columnLabels[currentPosition - 1] || currentPosition}
													</span>
												{/if}
											</div>
										</th>
									{/each}
								</tr>
							</thead>
							<tbody>
								{#each tableRows as row, rowIndex (rowIndex)}
									<tr>
										{#each row as cell, colIndex (colIndex)}
											{@const position = getColumnPosition(colIndex)}
											<td class={position ? 'fu-selected-col' : ''}>
												{#if position}
													<span class="fu-position-badge">{position}</span>
												{/if}
												{cell}
											</td>
										{/each}
									</tr>
								{/each}
							</tbody>
						</table>
					</div>

					{#if tableRows.length === PREVIEW_ROWS}
						<div class="fu-preview-note">
							{t.showingFirstRows.replace('{count}', String(PREVIEW_ROWS))}
						</div>
					{/if}
				</div>
			{:else if fileContent}
				<!-- Text preview -->
				<div class="fu-text-preview">
					<div class="fu-section-title">{t.previewTitle}</div>
					<pre>{fileContent.substring(0, 1000)}{fileContent.length > 1000 ? '...' : ''}</pre>
				</div>
			{/if}
		{/if}
	</div>

	{#snippet footer()}
		<div class="fu-footer">
			<button class="fu-btn-secondary" onclick={onClose}>
				{t.cancel}
			</button>
			<button class="fu-btn-primary" onclick={handleConfirm} disabled={!canConfirm}>
				{t.confirm}
			</button>
		</div>
	{/snippet}
</Modal>

<style>
	.fu-container {
		min-height: 300px;
	}

	.fu-area {
		border: 2px dashed var(--pe-border, #30363d);
		border-radius: 8px;
		padding: 32px;
		text-align: center;
		transition: all 0.2s;
		background: var(--pe-bg3, #21262d);
	}

	.fu-area.fu-dragging {
		border-color: var(--pe-accent, #58a6ff);
		background: rgba(88, 166, 255, 0.05);
	}

	.fu-area :global(svg) {
		color: var(--pe-muted, #8b949e);
		margin-bottom: 16px;
	}

	.fu-text {
		font-size: 14px;
		font-weight: 500;
		color: var(--pe-text, #e6edf3);
		margin: 0 0 8px 0;
	}

	.fu-hint {
		font-size: 12px;
		color: var(--pe-muted, #8b949e);
		margin: 0 0 16px 0;
	}

	.fu-button {
		display: inline-block;
		padding: 8px 16px;
		background: var(--pe-accent, #58a6ff);
		color: white;
		border-radius: 6px;
		font-weight: 500;
		cursor: pointer;
		transition: opacity 0.2s;
	}

	.fu-button:hover {
		opacity: 0.9;
	}

	.fu-button input {
		display: none;
	}

	.fu-file-info {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 12px;
		background: var(--pe-bg3, #21262d);
		border-radius: 6px;
		margin-bottom: 16px;
	}

	.fu-file-icon {
		color: var(--pe-accent, #58a6ff);
	}

	.fu-file-details {
		flex: 1;
	}

	.fu-file-name {
		font-weight: 500;
		color: var(--pe-text, #e6edf3);
	}

	.fu-file-size {
		font-size: 12px;
		color: var(--pe-muted, #8b949e);
	}

	.fu-file-remove {
		background: none;
		border: none;
		cursor: pointer;
		color: var(--pe-muted, #8b949e);
		padding: 4px;
		border-radius: 4px;
		transition: all 0.2s;
	}

	.fu-file-remove:hover {
		background: var(--pe-bg, #0d1117);
		color: var(--pe-text, #e6edf3);
	}

	.fu-error {
		padding: 12px;
		background: rgba(248, 81, 73, 0.1);
		border: 1px solid var(--pe-error, #f85149);
		border-radius: 6px;
		color: var(--pe-error, #f85149);
		margin-bottom: 16px;
	}

	.fu-mode-switcher {
		display: flex;
		gap: 8px;
		padding: 12px;
		background: var(--pe-bg3, #21262d);
		border-radius: 6px;
		margin-bottom: 16px;
	}

	.fu-mode-btn {
		flex: 1;
		padding: 8px 12px;
		background: var(--pe-bg, #0d1117);
		border: 1px solid var(--pe-border, #30363d);
		border-radius: 4px;
		font-size: 12px;
		font-weight: 500;
		color: var(--pe-text, #e6edf3);
		cursor: pointer;
		transition: all 0.2s ease;
	}

	.fu-mode-btn:hover {
		border-color: var(--pe-accent, #58a6ff);
		background: rgba(88, 166, 255, 0.05);
	}

	.fu-mode-btn.active {
		background: var(--pe-accent, #58a6ff);
		color: white;
		border-color: transparent;
	}

	.fu-processing {
		text-align: center;
		padding: 16px;
		color: var(--pe-muted, #8b949e);
	}

	.fu-table-section {
		margin-top: 16px;
	}

	.fu-section-title {
		font-size: 14px;
		font-weight: 600;
		color: var(--pe-text, #e6edf3);
		margin-bottom: 12px;
	}

	.fu-column-hint {
		padding: 8px;
		background: rgba(88, 166, 255, 0.1);
		border-left: 3px solid var(--pe-accent, #58a6ff);
		border-radius: 4px;
		font-size: 12px;
		color: var(--pe-accent, #58a6ff);
		margin-bottom: 12px;
	}

	.fu-table-wrapper {
		overflow-x: auto;
		border: 1px solid var(--pe-border, #30363d);
		border-radius: 6px;
	}

	.fu-table {
		width: 100%;
		border-collapse: collapse;
		font-size: 12px;
	}

	.fu-table th,
	.fu-table td {
		padding: 8px;
		text-align: left;
		border-bottom: 1px solid var(--pe-border, #30363d);
		transition: all 0.2s ease;
	}

	.fu-table tbody tr:hover td {
		background: var(--pe-bg3, #21262d);
	}

	.fu-table th {
		background: var(--pe-bg3, #21262d);
		font-weight: 600;
		position: sticky;
		top: 0;
		z-index: 10;
	}

	.fu-table th.fu-clickable {
		cursor: pointer;
		user-select: none;
	}

	.fu-table th.fu-clickable:hover {
		background: var(--pe-bg, #0d1117);
	}

	.fu-table th.fu-has-selection {
		background: rgba(88, 166, 255, 0.12);
		border-top: 3px solid var(--pe-accent, #58a6ff);
	}

	.fu-header-cell {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
		min-width: 100px;
	}

	.fu-header-text {
		font-weight: 600;
		color: var(--pe-text, #e6edf3);
	}

	.fu-column-stamp {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-width: 28px;
		height: 26px;
		padding: 0 8px;
		background: var(--pe-accent, #58a6ff);
		color: white;
		border-radius: 13px;
		font-size: 12px;
		font-weight: 600;
	}

	.fu-table td.fu-selected-col {
		background: rgba(63, 185, 80, 0.1);
		border-left: 2px solid var(--pe-success, #3fb950);
		border-right: 2px solid var(--pe-success, #3fb950);
	}

	.fu-position-badge {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-width: 18px;
		height: 18px;
		padding: 0 4px;
		background: var(--pe-success, #3fb950);
		color: white;
		border-radius: 9px;
		font-size: 10px;
		font-weight: 600;
		margin-right: 6px;
	}

	.fu-preview-note {
		padding: 8px;
		text-align: center;
		font-size: 12px;
		color: var(--pe-muted, #8b949e);
	}

	.fu-text-preview {
		margin-top: 16px;
	}

	.fu-text-preview pre {
		padding: 12px;
		background: var(--pe-bg3, #21262d);
		border-radius: 6px;
		overflow: auto;
		max-height: 400px;
		font-size: 12px;
		font-family: var(--pe-font, 'JetBrains Mono', monospace);
		color: var(--pe-text, #e6edf3);
	}

	.fu-footer {
		display: flex;
		gap: 8px;
		justify-content: flex-end;
	}

	.fu-btn-secondary,
	.fu-btn-primary {
		padding: 8px 16px;
		border-radius: 6px;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.2s;
	}

	.fu-btn-secondary {
		background: var(--pe-bg3, #21262d);
		border: 1px solid var(--pe-border, #30363d);
		color: var(--pe-text, #e6edf3);
	}

	.fu-btn-secondary:hover {
		background: var(--pe-bg, #0d1117);
	}

	.fu-btn-primary {
		background: var(--pe-accent, #58a6ff);
		border: 1px solid var(--pe-accent, #58a6ff);
		color: white;
	}

	.fu-btn-primary:hover:not(:disabled) {
		opacity: 0.9;
	}

	.fu-btn-primary:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
</style>
