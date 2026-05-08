/* DataMining AI - Main Application Logic */
(function () {
    'use strict';


    // ===== INDEXEDDB DATASET CACHE =====
    const CACHE_DB_NAME = 'DataMiningAI_Cache';
    const CACHE_STORE = 'datasets';
    const CACHE_KEY = 'current';

    function openCacheDB() {
        return new Promise((resolve, reject) => {
            const req = indexedDB.open(CACHE_DB_NAME, 1);
            req.onupgradeneeded = () => req.result.createObjectStore(CACHE_STORE);
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });
    }

    async function saveDatasetToCache(data, columns, columnTypes, fileName) {
        try {
            const db = await openCacheDB();
            const tx = db.transaction(CACHE_STORE, 'readwrite');
            tx.objectStore(CACHE_STORE).put({ data, columns, columnTypes, fileName, savedAt: Date.now() }, CACHE_KEY);
            await new Promise((res, rej) => { tx.oncomplete = res; tx.onerror = rej; });
            db.close();
        } catch (e) { console.warn('Cache save failed:', e); }
    }

    async function loadDatasetFromCache() {
        try {
            const db = await openCacheDB();
            const tx = db.transaction(CACHE_STORE, 'readonly');
            const req = tx.objectStore(CACHE_STORE).get(CACHE_KEY);
            const result = await new Promise((res, rej) => { req.onsuccess = () => res(req.result); req.onerror = rej; });
            db.close();
            return result || null;
        } catch (e) { console.warn('Cache load failed:', e); return null; }
    }

    async function clearDatasetCache() {
        try {
            const db = await openCacheDB();
            const tx = db.transaction(CACHE_STORE, 'readwrite');
            tx.objectStore(CACHE_STORE).delete(CACHE_KEY);
            await new Promise((res, rej) => { tx.oncomplete = res; tx.onerror = rej; });
            db.close();
        } catch (e) { console.warn('Cache clear failed:', e); }
    }


    // ===== APP STATE =====
    const MAX_ROWS = 200000;
    const MAX_COLS = 500;

    const state = {
        rawData: [], data: [], columns: [], columnTypes: {},
        fileName: '', currentPage: 0, pageSize: 50,
        sortColumn: null, sortDirection: 'asc',
        // ai settings removed
        currentChart: null, chartHistory: [],
        themeIndex: 0, themes: ['theme-dark', 'theme-light', 'theme-red'],
        clipboard: null,
        lastPythonCode: '',
        pythonDebounceTimer: null,
        execCounter: 0,
        // Multi-cell notebook
        notebookCells: [],  // [{id, type, xCol, yCol, plotlyEl, codeEl}]
        cellCounter: 0,
        notebookExpanded: false,
    };

    // ===== DOM =====
    const $ = (s) => document.querySelector(s);
    const $$ = (s) => document.querySelectorAll(s);
    const dom = {};
    function cacheDom() {
        const ids = ['dataSummary', 'rowCount', 'colCount', 'nullCount',
            'downloadBtn', 'downloadMenu', 'uploadSection', 'dropzone', 'fileInput', 'workspace',
            'xAxisSelect', 'yAxisSelect', 'chartButtons', 'dataTableHead', 'dataTableBody', 'tableSearch',
            'prevPage', 'nextPage', 'pageInfo', 'chartArea', 'chartPlaceholder', 'statsPanel', 'statsContent',
            'closeStats', 'nullFillBtn', 'nullFillMenu', 'linearRegBtn', 'corrMatrixBtn', 'descStatsBtn',
            'dataInfoBtn', 'outlierBtn', 'normalizeBtn', 'clearChart', 'fullscreenChart',
            'viewSplit', 'viewTable', 'viewChart', 'panels', 'toastContainer', 'themeToggle',
            'sheetBtn', 'addTextBtn', 'cutBtn', 'copyBtn', 'pasteBtn',
            'scrollToolbarLeft', 'scrollToolbarRight', 'toolbar',
            'textModal', 'closeTextModal', 'annotationText', 'addAnnotationBtn',
            'sheetModal', 'closeSheetModal', 'sheetFormat', 'generateSheetBtn',
            'chartSfxOverlay',
            'zoomInBtn', 'zoomOutBtn', 'resetViewBtn',
            'pythonCodePanel', 'pythonCodeEditor', 'pythonCodeBody',
            'runPythonBtn', 'copyPythonBtn', 'togglePythonBtn',
            'newDatasetBtn',
            'loadingOverlay', 'loadingText',
            'execCount', 'outputCell',
            // Multi-cell notebook
            'notebookBody', 'notebookWelcome', 'addCellBtn', 'clearAllCellsBtn', 'addFirstCellBtn'];
        ids.forEach(id => { dom[id] = document.getElementById(id); });
    }

    // ===== INIT =====
    function init() {
        cacheDom();
        const savedTheme = localStorage.getItem('theme_index');
        if (savedTheme !== null) { state.themeIndex = parseInt(savedTheme); applyTheme(); }
        setupEvents();
        // Restore cached dataset if available
        restoreCachedDataset();
    }

    async function restoreCachedDataset() {
        try {
            const cached = await loadDatasetFromCache();
            if (cached && cached.data && cached.data.length && cached.columns && cached.columns.length) {
                state.rawData = JSON.parse(JSON.stringify(cached.data));
                state.data = cached.data;
                state.columns = cached.columns;
                state.columnTypes = cached.columnTypes || {};
                state.fileName = cached.fileName || 'cached_data.csv';
                if (!Object.keys(state.columnTypes).length) detectColumnTypes();
                showWorkspace();
                showToast(`Restored "${state.fileName}" from cache (${state.data.length} rows)`, 'success');
            }
        } catch (e) { console.warn('Could not restore cached dataset:', e); }
    }

    // ===== THEME CYCLING =====
    function cycleTheme() {
        state.themeIndex = (state.themeIndex + 1) % state.themes.length;
        applyTheme();
        localStorage.setItem('theme_index', state.themeIndex);
        const names = ['Dark Blue', 'Light Vintage', 'Red Black'];
        showToast(`Theme: ${names[state.themeIndex]}`, 'info');
    }

    function applyTheme() {
        state.themes.forEach(t => document.body.classList.remove(t));
        document.body.classList.add(state.themes[state.themeIndex]);
        if (state.currentChart) updateChartTheme();
    }

    function getChartColors() {
        const t = state.themeIndex;
        if (t === 1) return { bg: '#ffffff', grid: 'rgba(0,0,0,0.08)', text: '#4a4a4a', title: '#1a1a1a', paper: '#ffffff' };
        if (t === 2) return { bg: '#ffffff', grid: 'rgba(220,38,38,0.1)', text: '#333333', title: '#1a1a1a', paper: '#ffffff' };
        return { bg: '#ffffff', grid: 'rgba(124,58,237,0.1)', text: '#333333', title: '#1a1a1a', paper: '#ffffff' };
    }

    function updateChartTheme() {
        const c = getChartColors();
        try {
            Plotly.relayout(dom.chartArea, {
                'paper_bgcolor': c.paper, 'plot_bgcolor': c.bg,
                'font.color': c.text, 'xaxis.gridcolor': c.grid, 'yaxis.gridcolor': c.grid,
                'title.font.color': c.title
            });
        } catch (e) { }
    }



    // ===== EVENTS =====
    function setupEvents() {
        dom.themeToggle.onclick = cycleTheme;

        // File upload - only open file picker when clicking outside the label button
        dom.dropzone.onclick = (e) => { if (!e.target.closest('label')) dom.fileInput.click(); };
        dom.newDatasetBtn.onclick = newDataset;
        dom.fileInput.onchange = (e) => { if (e.target.files.length) handleFile(e.target.files[0]); };
        dom.dropzone.ondragover = (e) => { e.preventDefault(); dom.dropzone.classList.add('dragover'); };
        dom.dropzone.ondragleave = () => dom.dropzone.classList.remove('dragover');
        dom.dropzone.ondrop = (e) => { e.preventDefault(); dom.dropzone.classList.remove('dragover'); if (e.dataTransfer.files.length) handleFile(e.dataTransfer.files[0]); };

        // Charts
        dom.chartButtons.onclick = (e) => {
            const btn = e.target.closest('[data-chart]');
            if (btn) { generateChart(btn.dataset.chart); dom.chartButtons.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active')); btn.classList.add('active'); }
        };

        // Null fill — single click = smart auto-fill (mean for numeric, mode for string)
        dom.nullFillBtn.onclick = () => {
            if (!state.data.length) return;
            let filled = 0;
            state.columns.forEach(col => {
                const vals = getVals(col);
                let fv;
                if (state.columnTypes[col] === 'numeric') {
                    // Fill numeric with mean  (like: df['col'].fillna(df['col'].mean(), inplace=True))
                    fv = mean(vals.filter(v => typeof v === 'number'));
                } else {
                    // Fill string/categorical with mode (like: df['col'].fillna(df['col'].mode()[0], inplace=True))
                    fv = mode(vals);
                }
                if (fv != null) state.data.forEach(r => {
                    if (r[col] == null || r[col] === '') {
                        r[col] = typeof fv === 'number' ? Number(fv.toFixed(4)) : fv;
                        filled++;
                    }
                });
            });
            showToast(`Filled ${filled} nulls (numeric→mean, string→mode)`, 'success');
            updateSummary(); renderTable();
        };
        dom.nullFillMenu.onclick = (e) => { const btn = e.target.closest('[data-fill]'); if (btn) { fillNulls(btn.dataset.fill); dom.nullFillMenu.classList.remove('show'); } };

        // Tools
        dom.linearRegBtn.onclick = linearRegression;
        dom.corrMatrixBtn.onclick = () => { generateChart('heatmap'); showToast('Correlation matrix shown', 'info'); };
        dom.descStatsBtn.onclick = descriptiveStats;
        dom.dataInfoBtn.onclick = showDataInfo;
        dom.outlierBtn.onclick = detectOutliers;
        dom.normalizeBtn.onclick = normalizeData;
        dom.closeStats.onclick = () => { dom.statsPanel.style.display = 'none'; };
        // Notebook buttons
        if (dom.addCellBtn) dom.addCellBtn.onclick = () => addNotebookCell();
        if (dom.clearAllCellsBtn) dom.clearAllCellsBtn.onclick = clearAllCells;
        if (dom.addFirstCellBtn) dom.addFirstCellBtn.onclick = () => addNotebookCell();
        dom.fullscreenChart.onclick = toggleNotebookExpand;

        // Legacy python panel stubs (now per-cell)

        // Download
        dom.downloadBtn.onclick = () => dom.downloadMenu.classList.toggle('show');
        dom.downloadMenu.onclick = (e) => { const btn = e.target.closest('[data-export]'); if (btn) { exportData(btn.dataset.export); dom.downloadMenu.classList.remove('show'); } };

        // Views
        dom.viewSplit.onclick = () => setView('split');
        dom.viewTable.onclick = () => setView('table');
        dom.viewChart.onclick = () => setView('chart');

        // Table
        dom.tableSearch.oninput = () => { state.currentPage = 0; renderTable(); };
        dom.prevPage.onclick = () => { if (state.currentPage > 0) { state.currentPage--; renderTable(); } };
        dom.nextPage.onclick = () => { const max = Math.ceil(getFilteredData().length / state.pageSize) - 1; if (state.currentPage < max) { state.currentPage++; renderTable(); } };

        // Chat events removed

        // Toolbar scroll
        dom.scrollToolbarLeft.onclick = () => { dom.toolbar.scrollLeft -= 200; };
        dom.scrollToolbarRight.onclick = () => { dom.toolbar.scrollLeft += 200; };

        // Sheet & Text tools
        dom.sheetBtn.onclick = () => { dom.sheetModal.style.display = 'flex'; };
        dom.closeSheetModal.onclick = () => { dom.sheetModal.style.display = 'none'; };
        dom.generateSheetBtn.onclick = generateSheet;
        dom.addTextBtn.onclick = () => { dom.textModal.style.display = 'flex'; };
        dom.closeTextModal.onclick = () => { dom.textModal.style.display = 'none'; };
        dom.addAnnotationBtn.onclick = addTextAnnotation;

        // Cut/Copy/Paste
        dom.cutBtn.onclick = () => { copyTableSelection(); showToast('Data cut to clipboard', 'success'); };
        dom.copyBtn.onclick = () => { copyTableSelection(); showToast('Data copied to clipboard', 'success'); };
        dom.pasteBtn.onclick = pasteFromClipboard;

        // Chart SFX on click
        dom.chartArea.addEventListener('click', triggerChartSFX);

        // Close dropdowns
        document.onclick = (e) => {
            if (!e.target.closest('#downloadDropdown')) dom.downloadMenu.classList.remove('show');
            if (!e.target.closest('.dropdown-tool')) dom.nullFillMenu.classList.remove('show');
        };
    }



    // ===== ZOOM HELPER =====
    function zoomAxis(axis, factor) {
        try {
            const layout = dom.chartArea.layout;
            if (!layout || !layout[axis]) return undefined;
            const range = layout[axis].range;
            if (!range || range.length < 2) return undefined;
            const mid = (range[0] + range[1]) / 2, half = (range[1] - range[0]) / 2 * factor;
            return [mid - half, mid + half];
        } catch (e) { return undefined; }
    }

    // ===== FILE HANDLING =====
    function showLoading(msg) { dom.loadingText.textContent = msg || 'Processing data...'; dom.loadingOverlay.style.display = 'flex'; }
    function hideLoading() { dom.loadingOverlay.style.display = 'none'; }

    function handleFile(file) {
        if (!file.name.endsWith('.csv')) { showToast('Please upload a CSV file', 'error'); return; }
        state.fileName = file.name;
        showLoading(`Loading ${file.name}...`);
        Papa.parse(file, {
            header: true, dynamicTyping: true, skipEmptyLines: true,
            complete: (r) => {
                try {
                    let cols = r.meta.fields || [];
                    let rows = r.data || [];

                    // Trim whitespace from column names
                    cols = cols.map(c => (c || '').trim()).filter(c => c.length > 0);

                    // Deduplicate column names
                    const seen = {};
                    cols = cols.map(c => {
                        if (seen[c]) { seen[c]++; return `${c}_${seen[c]}`; }
                        seen[c] = 1; return c;
                    });

                    // Re-map rows to cleaned column names
                    const origFields = r.meta.fields || [];
                    if (origFields.length !== cols.length || origFields.some((f, i) => f !== cols[i])) {
                        rows = rows.map(row => {
                            const nr = {};
                            origFields.forEach((f, i) => { if (i < cols.length) nr[cols[i]] = row[f]; });
                            return nr;
                        });
                    }

                    if (cols.length > MAX_COLS) {
                        showToast(`Too many columns (${cols.length}). Max supported: ${MAX_COLS}. Truncating columns.`, 'error');
                        cols = cols.slice(0, MAX_COLS);
                        rows = rows.map(row => {
                            const nr = {}; cols.forEach(c => nr[c] = row[c]); return nr;
                        });
                    }
                    if (rows.length > MAX_ROWS) {
                        showToast(`Very large file (${rows.length} rows). Truncating to ${MAX_ROWS} rows for performance.`, 'error');
                        rows = rows.slice(0, MAX_ROWS);
                    }
                    // Safe deep clone (fallback for very large data)
                    try {
                        state.rawData = JSON.parse(JSON.stringify(rows));
                    } catch (cloneErr) {
                        state.rawData = rows.map(r2 => Object.assign({}, r2));
                    }
                    state.data = rows;
                    state.columns = cols;
                    detectColumnTypes();
                    showWorkspace();
                    hideLoading();
                    showToast(`Loaded "${file.name}" — ${state.data.length} rows, ${state.columns.length} cols`, 'success');
                    // Cache the dataset in IndexedDB for instant restore on refresh
                    saveDatasetToCache(state.data, state.columns, state.columnTypes, state.fileName);
                } catch (err) {
                    hideLoading();
                    showToast('Error processing file: ' + err.message, 'error');
                }
            },
            error: (err) => { hideLoading(); showToast('Failed to parse file: ' + (err.message || 'Unknown error'), 'error'); }
        });
    }

    function detectColumnTypes() {
        state.columnTypes = {};
        state.columns.forEach(col => {
            let n = 0, s = 0;
            state.data.forEach(row => { const v = row[col]; if (v == null || v === '') return; typeof v === 'number' || (!isNaN(Number(v)) && v !== '') ? n++ : s++; });
            state.columnTypes[col] = n >= s ? 'numeric' : 'string';
        });
    }

    function showWorkspace() {
        dom.uploadSection.style.display = 'none';
        dom.workspace.style.display = 'flex';
        dom.dataSummary.style.display = 'flex';
        dom.newDatasetBtn.style.display = 'inline-flex';
        [dom.xAxisSelect, dom.yAxisSelect].forEach(sel => {
            sel.innerHTML = '<option value="">Select column</option>';
            state.columns.forEach(col => { const o = document.createElement('option'); o.value = col; o.textContent = col; sel.appendChild(o); });
        });
        if (state.columns.length > 0) dom.xAxisSelect.value = state.columns[0];
        if (state.columns.length > 1) dom.yAxisSelect.value = state.columns[1];
        else if (state.columns.length === 1) dom.yAxisSelect.value = state.columns[0];
        updateSummary(); renderTable();
    }

    async function newDataset() {
        await clearDatasetCache();
        state.rawData = []; state.data = []; state.columns = []; state.columnTypes = {};
        state.fileName = ''; state.currentPage = 0; state.sortColumn = null;
        state.currentChart = null; state.chartHistory = [];
        dom.uploadSection.style.display = 'flex';
        dom.workspace.style.display = 'none';
        dom.dataSummary.style.display = 'none';
        dom.newDatasetBtn.style.display = 'none';
        dom.statsPanel.style.display = 'none';
        dom.fileInput.value = '';
        // Clear notebook cells
        clearAllCells();
        showToast('Cache cleared — upload a new dataset', 'info');
    }

    function updateSummary() {
        dom.rowCount.innerHTML = `<i class="fas fa-table"></i> ${state.data.length} rows`;
        dom.colCount.innerHTML = `<i class="fas fa-columns"></i> ${state.columns.length} cols`;
        dom.nullCount.innerHTML = `<i class="fas fa-exclamation-triangle"></i> ${countNulls()} nulls`;
    }

    function countNulls() { let c = 0; state.data.forEach(r => state.columns.forEach(col => { if (r[col] == null || r[col] === '') c++; })); return c; }

    // ===== TABLE =====
    function getFilteredData() {
        const q = dom.tableSearch.value.toLowerCase().trim();
        if (!q) return state.data;
        return state.data.filter(r => state.columns.some(c => { const v = r[c]; return v != null && String(v).toLowerCase().includes(q); }));
    }

    function renderTable() {
        const fd = getFilteredData();
        // Use data-col attribute to avoid issues with special characters in column names
        dom.dataTableHead.innerHTML = '<tr><th class="row-num-header">#</th>' + state.columns.map(c => {
            const escaped = c.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
            const sortIcon = state.sortColumn === c ? (state.sortDirection === 'asc' ? '▲' : '▼') : '⇅';
            return `<th data-col="${escaped}">${escaped} <span class="sort-icon">${sortIcon}</span></th>`;
        }).join('') + '</tr>';
        // Attach click handler via event delegation
        dom.dataTableHead.onclick = (e) => {
            const th = e.target.closest('th[data-col]');
            if (th) window.__sort(th.dataset.col);
        };
        // Render all rows (no pagination)
        dom.dataTableBody.innerHTML = fd.map((r, rowIdx) => '<tr><td class="row-num">' + (rowIdx + 1) + '</td>' + state.columns.map((c, colIdx) => {
            const v = r[c], isNull = v == null || v === '', cls = isNull ? 'null-cell' : (state.columnTypes[c] === 'numeric' ? 'numeric' : '');
            const displayVal = isNull ? '<span class="null-tag">null</span>' : String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
            return `<td class="${cls} editable-cell" data-row="${rowIdx}" data-col="${c.replace(/"/g, '&quot;')}">${displayVal}</td>`;
        }).join('') + '</tr>').join('');
        // Show row count info instead of pagination
        dom.pageInfo.textContent = `${fd.length} rows × ${state.columns.length} cols`;
        dom.prevPage.style.display = 'none';
        dom.nextPage.style.display = 'none';
        // Enable cell editing via double-click
        dom.dataTableBody.ondblclick = (e) => {
            const td = e.target.closest('td.editable-cell');
            if (!td || td.querySelector('input')) return;
            const rowIdx = parseInt(td.dataset.row);
            const colName = td.dataset.col;
            const fd2 = getFilteredData();
            const currentVal = fd2[rowIdx] ? fd2[rowIdx][colName] : '';
            const displayCurrent = (currentVal == null || currentVal === '') ? '' : currentVal;
            // Create inline editor
            const input = document.createElement('input');
            input.type = 'text';
            input.className = 'cell-editor';
            input.value = displayCurrent;
            td.innerHTML = '';
            td.appendChild(input);
            input.focus();
            input.select();
            const save = () => {
                const newVal = input.value.trim();
                // Find the actual row in state.data
                const actualRow = fd2[rowIdx];
                if (!actualRow) return;
                if (state.columnTypes[colName] === 'numeric' && newVal !== '') {
                    const num = Number(newVal);
                    actualRow[colName] = isNaN(num) ? newVal : num;
                } else {
                    actualRow[colName] = newVal === '' ? null : newVal;
                }
                updateSummary();
                renderTable();
                showToast(`Cell updated: ${colName}[${rowIdx}]`, 'success');
            };
            input.onblur = save;
            input.onkeydown = (ev) => {
                if (ev.key === 'Enter') { ev.preventDefault(); save(); }
                if (ev.key === 'Escape') { renderTable(); }
            };
        };
    }

    window.__sort = function (col) {
        if (state.sortColumn === col) state.sortDirection = state.sortDirection === 'asc' ? 'desc' : 'asc';
        else { state.sortColumn = col; state.sortDirection = 'asc'; }
        state.data.sort((a, b) => {
            let va = a[col] ?? '', vb = b[col] ?? '';
            if (state.columnTypes[col] === 'numeric') { va = Number(va) || 0; vb = Number(vb) || 0; } else { va = String(va).toLowerCase(); vb = String(vb).toLowerCase(); }
            return (va < vb ? -1 : va > vb ? 1 : 0) * (state.sortDirection === 'asc' ? 1 : -1);
        });
        renderTable();
    };

    function setView(mode) {
        dom.viewSplit.classList.toggle('active', mode === 'split');
        dom.viewTable.classList.toggle('active', mode === 'table');
        dom.viewChart.classList.toggle('active', mode === 'chart');
        dom.panels.classList.remove('table-only', 'chart-only');
        if (mode === 'table') dom.panels.classList.add('table-only');
        if (mode === 'chart') dom.panels.classList.add('chart-only');
        if (state.currentChart) setTimeout(() => Plotly.Plots.resize(dom.chartArea), 100);
    }

    // ===== CHARTS & MULTI-CELL NOTEBOOK =====
    function getVals(col) { return state.data.map(r => r[col]).filter(v => v != null && v !== ''); }
    function getNumVals(col) { return getVals(col).map(Number).filter(v => isFinite(v)); }

    // Chart icon map
    const CHART_ICONS = { bar:'chart-bar', line:'chart-line', scatter:'braille', histogram:'signal', pie:'chart-pie', box:'box', heatmap:'th', area:'mountain', violin:'water', bubble:'circle', regression:'project-diagram' };

    // Build Plotly traces/layout for a given type+cols
    function buildChartConfig(type, xCol, yCol, containerEl) {
        const c = getChartColors();
        const pal = ['#7c3aed','#06b6d4','#10b981','#f59e0b','#f43f5e','#a78bfa','#34d399','#fb923c','#e879f9','#818cf8'];
        const mkTitle = t => ({ text: t, font: { size: 16, color: c.title }, x: 0.5, xanchor: 'center' });
        const axCfg = (lbl) => ({ title: { text: lbl, font: { size: 13, color: c.text } }, gridcolor: c.grid, zerolinecolor: c.grid, linecolor: c.grid, showgrid: true, color: c.text });
        const baseLayout = {
            paper_bgcolor: c.paper, plot_bgcolor: c.bg,
            font: { family: 'Inter, sans-serif', color: c.text, size: 12 },
            margin: { t: 60, r: 40, b: 70, l: 70 },
            showlegend: false, autosize: true, dragmode: 'pan',
            hoverlabel: { bgcolor: '#1e1e2e', bordercolor: '#7c3aed', font: { color: '#f1f5f9', size: 12 } },
        };
        const config = { responsive: true, displayModeBar: true, scrollZoom: true, displaylogo: false };
        let traces = [], layout = Object.assign({}, baseLayout);

        switch (type) {
            case 'bar': {
                if (!xCol || !yCol) { showToast('Select X and Y columns for Bar chart', 'error'); return null; }
                const xv = getVals(xCol), yv = getNumVals(yCol), len = Math.min(xv.length, yv.length);
                if (!len) { showToast('No valid data for Bar chart', 'error'); return null; }
                traces = [{ x: xv.slice(0,len), y: yv.slice(0,len), type: 'bar',
                    marker: { color: yv.slice(0,len).map((_,i) => pal[i % pal.length]), opacity: 0.88, line: { color: 'rgba(255,255,255,0.1)', width: 1 } },
                    hovertemplate: `<b>%{x}</b><br>${yCol}: <b>%{y}</b><extra></extra>` }];
                layout = { ...layout, title: mkTitle(`${yCol} by ${xCol}`), xaxis: axCfg(xCol), yaxis: axCfg(yCol), bargap: 0.2 };
                break;
            }
            case 'line': {
                if (!xCol || !yCol) { showToast('Select X and Y columns for Line chart', 'error'); return null; }
                const xv = getVals(xCol), yv = getNumVals(yCol), len = Math.min(xv.length, yv.length);
                if (!len) { showToast('No valid data for Line chart', 'error'); return null; }
                traces = [{ x: xv.slice(0,len), y: yv.slice(0,len), type: 'scatter', mode: 'lines+markers',
                    line: { color: '#7c3aed', width: 3, shape: 'spline', smoothing: 0.8 },
                    marker: { color: '#a78bfa', size: 6, line: { color: '#7c3aed', width: 2 } },
                    hovertemplate: `${xCol}: %{x}<br><b>${yCol}: %{y}</b><extra></extra>` }];
                layout = { ...layout, title: mkTitle(`${yCol} over ${xCol}`), xaxis: axCfg(xCol), yaxis: axCfg(yCol) };
                break;
            }
            case 'scatter': {
                if (!xCol || !yCol) { showToast('Select X and Y columns for Scatter chart', 'error'); return null; }
                const xv = getNumVals(xCol), yv = getNumVals(yCol), len = Math.min(xv.length, yv.length);
                if (!len) { showToast('No numeric data for Scatter chart', 'error'); return null; }
                traces = [{ x: xv.slice(0,len), y: yv.slice(0,len), type: 'scatter', mode: 'markers',
                    marker: { color: xv.slice(0,len), colorscale: [[0,'#7c3aed'],[0.5,'#06b6d4'],[1,'#10b981']],
                        size: 9, opacity: 0.78, showscale: true, colorbar: { thickness: 14, outlinewidth: 0 },
                        line: { color: 'rgba(255,255,255,0.15)', width: 1 } },
                    hovertemplate: `${xCol}: %{x}<br>${yCol}: %{y}<extra></extra>` }];
                layout = { ...layout, title: mkTitle(`${xCol} vs ${yCol}`), xaxis: axCfg(xCol), yaxis: axCfg(yCol) };
                break;
            }
            case 'histogram': {
                // Prefer a meaningful numeric column — yCol first if numeric, else xCol
                let col = (yCol && state.columnTypes[yCol] === 'numeric') ? yCol
                        : (xCol && state.columnTypes[xCol] === 'numeric') ? xCol
                        : yCol || xCol;
                if (!col) { showToast('Select a column for Histogram', 'error'); return null; }
                const vals = getNumVals(col);
                if (!vals.length) { showToast(`No numeric data in "${col}" for Histogram`, 'error'); return null; }
                // Sturges rule for bin count, max 60
                const bins = Math.min(60, Math.max(10, Math.ceil(1 + 3.322 * Math.log10(vals.length))));
                traces = [{ x: vals, type: 'histogram', nbinsx: bins,
                    marker: { color: '#7c3aed', opacity: 0.85, line: { color: '#a78bfa', width: 1.2 } },
                    hovertemplate: 'Range: %{x}<br>Count: %{y}<extra></extra>' }];
                layout = { ...layout, title: mkTitle(`Distribution of ${col}`),
                    xaxis: axCfg(col), yaxis: axCfg('Frequency'), bargap: 0.06 };
                break;
            }
            case 'pie': {
                const col = xCol || yCol;
                if (!col) { showToast('Select a column for Pie chart', 'error'); return null; }
                const vals = getVals(col);
                if (!vals.length) { showToast('No data for Pie chart', 'error'); return null; }
                const counts = {};
                vals.forEach(v => counts[String(v)] = (counts[String(v)] || 0) + 1);
                const sorted = Object.entries(counts).sort((a,b) => b[1]-a[1]).slice(0, 15);
                traces = [{ labels: sorted.map(d=>d[0]), values: sorted.map(d=>d[1]), type: 'pie',
                    hole: 0.38, marker: { colors: pal, line: { color: c.paper, width: 2 } },
                    textfont: { color: '#f1f5f9', size: 11 }, textinfo: 'label+percent',
                    hovertemplate: '<b>%{label}</b><br>Count: %{value}<br>%{percent}<extra></extra>' }];
                layout = { ...layout, title: mkTitle(`Distribution of ${col}`), showlegend: true,
                    legend: { font: { color: c.text }, bgcolor: 'transparent' } };
                break;
            }
            case 'box': {
                const numCols = state.columns.filter(c2 => state.columnTypes[c2] === 'numeric');
                const cols = yCol ? [yCol] : (xCol ? [xCol] : numCols.slice(0, 6));
                if (!cols.length) { showToast('No numeric columns for Box plot', 'error'); return null; }
                traces = cols.map((c2, i) => ({ y: getNumVals(c2), type: 'box', name: c2,
                    marker: { color: pal[i % pal.length], size: 4, opacity: 0.65 },
                    line: { color: pal[i % pal.length], width: 2 },
                    fillcolor: pal[i % pal.length] + '33', boxpoints: 'outliers', jitter: 0.35,
                    hovertemplate: `<b>${c2}</b><br>%{y}<extra></extra>` }));
                layout = { ...layout, title: mkTitle(cols.length === 1 ? `Box Plot — ${cols[0]}` : 'Box Plot Comparison'),
                    xaxis: axCfg(''), yaxis: axCfg('Value'), showlegend: cols.length > 1 };
                break;
            }
            case 'heatmap': {
                const numCols = state.columns.filter(c2 => state.columnTypes[c2] === 'numeric').slice(0, 15);
                if (numCols.length < 2) { showToast('Need 2+ numeric columns for Heatmap', 'error'); return null; }
                const matrix = numCols.map(c1 => numCols.map(c2 => pearsonCorr(getNumVals(c1), getNumVals(c2))));
                traces = [{ z: matrix, x: numCols, y: numCols, type: 'heatmap',
                    colorscale: [[0,'#f43f5e'],[0.25,'#fb923c'],[0.5,'#1e1e3f'],[0.75,'#06b6d4'],[1,'#10b981']],
                    zmin: -1, zmax: 1,
                    text: matrix.map(row => row.map(v => isFinite(v) ? v.toFixed(2) : 'N/A')),
                    texttemplate: '%{text}', textfont: { color: '#fff', size: 10 },
                    hovertemplate: 'X: %{x}<br>Y: %{y}<br>r = %{z:.3f}<extra></extra>',
                    colorbar: { title: 'r', thickness: 16, outlinewidth: 0 } }];
                layout = { ...layout, title: mkTitle('Correlation Heatmap'),
                    xaxis: { ...axCfg(''), tickangle: -35 }, yaxis: axCfg(''),
                    margin: { t: 60, r: 60, b: 110, l: 110 } };
                break;
            }
            case 'area': {
                if (!xCol || !yCol) { showToast('Select X and Y columns for Area chart', 'error'); return null; }
                const xv = getVals(xCol), yv = getNumVals(yCol), len = Math.min(xv.length, yv.length);
                if (!len) { showToast('No valid data for Area chart', 'error'); return null; }
                traces = [{ x: xv.slice(0,len), y: yv.slice(0,len), type: 'scatter', mode: 'lines',
                    fill: 'tozeroy', fillcolor: 'rgba(124,58,237,0.18)',
                    line: { color: '#7c3aed', width: 2.5, shape: 'spline', smoothing: 0.8 },
                    hovertemplate: `${xCol}: %{x}<br><b>${yCol}: %{y}</b><extra></extra>` }];
                layout = { ...layout, title: mkTitle(`${yCol} over ${xCol}`), xaxis: axCfg(xCol), yaxis: axCfg(yCol) };
                break;
            }
            case 'violin': {
                const col = yCol || xCol;
                if (!col) { showToast('Select a column for Violin plot', 'error'); return null; }
                const vals = getNumVals(col);
                if (vals.length < 5) { showToast('Need 5+ numeric values for Violin plot', 'error'); return null; }
                traces = [{ y: vals, type: 'violin', name: col,
                    box: { visible: true, width: 0.3 },
                    meanline: { visible: true, color: '#f59e0b', width: 2 },
                    line: { color: '#7c3aed', width: 2 },
                    fillcolor: 'rgba(124,58,237,0.28)',
                    marker: { color: '#7c3aed', size: 4, opacity: 0.5 },
                    points: 'outliers', jitter: 0.35,
                    hovertemplate: `<b>${col}</b>: %{y}<extra></extra>` }];
                layout = { ...layout, title: mkTitle(`Violin Plot — ${col}`), xaxis: axCfg(''), yaxis: axCfg(col) };
                break;
            }
            case 'bubble': {
                if (!xCol || !yCol) { showToast('Select X and Y columns for Bubble chart', 'error'); return null; }
                const xv = getNumVals(xCol), yv = getNumVals(yCol), len = Math.min(xv.length, yv.length);
                if (!len) { showToast('No numeric data for Bubble chart', 'error'); return null; }
                // Size from a 3rd numeric column if available, else y-magnitude
                const extra = state.columns.find(c2 => state.columnTypes[c2]==='numeric' && c2!==xCol && c2!==yCol);
                const szRaw = extra ? getNumVals(extra).slice(0,len) : yv.slice(0,len);
                const szMax = Math.max(...szRaw.map(Math.abs)) || 1;
                const sizes = szRaw.map(s => Math.max(6, (Math.abs(s)/szMax)*55));
                traces = [{ x: xv.slice(0,len), y: yv.slice(0,len), type: 'scatter', mode: 'markers',
                    marker: { size: sizes, color: yv.slice(0,len),
                        colorscale: [[0,'#7c3aed'],[0.5,'#06b6d4'],[1,'#10b981']],
                        showscale: true, colorbar: { title: yCol, thickness: 14, outlinewidth: 0 },
                        opacity: 0.72, line: { color: 'rgba(255,255,255,0.15)', width: 1 } },
                    hovertemplate: `${xCol}: %{x}<br>${yCol}: %{y}<extra></extra>` }];
                layout = { ...layout, title: mkTitle(`${xCol} vs ${yCol} — Bubble`), xaxis: axCfg(xCol), yaxis: axCfg(yCol) };
                break;
            }
        }
        if (!traces.length) return null;
        return { traces, layout, config };
    }

    // ===== PYTHON CODE GENERATOR =====
    function generatePythonCode(type, xCol, yCol) {
        const f = state.fileName || 'data.csv';
        const hdr = `import pandas as pd\nimport matplotlib.pyplot as plt\nimport seaborn as sns\nimport numpy as np\n\ndf = pd.read_csv('${f}')\nplt.style.use('seaborn-v0_8-darkgrid')\nfig, ax = plt.subplots(figsize=(10, 6))\n`;
        const ftr = `\nplt.tight_layout()\nplt.show()\n`;
        const xq = xCol ? `'${xCol}'` : 'None', yq = yCol ? `'${yCol}'` : 'None';
        const xdf = xCol ? `df['${xCol}']` : '', ydf = yCol ? `df['${yCol}']` : '';
        const histCol = (yCol && state.columnTypes[yCol]==='numeric') ? yCol : (xCol || yCol);
        const bodies = {
            bar:       `ax.bar(${xdf}, ${ydf}, color=sns.color_palette('viridis', len(df)))\nax.set_xlabel('${xCol}')\nax.set_ylabel('${yCol}')\nax.set_title('${yCol} by ${xCol}')`,
            line:      `ax.plot(${xdf}, ${ydf}, color='#7c3aed', lw=2.5, marker='o', ms=5)\nax.set_xlabel('${xCol}')\nax.set_ylabel('${yCol}')\nax.set_title('${yCol} over ${xCol}')`,
            scatter:   `ax.scatter(${xdf}, ${ydf}, c=${xdf}, cmap='viridis', alpha=0.75, edgecolors='white', lw=0.5)\nax.set_xlabel('${xCol}')\nax.set_ylabel('${yCol}')\nax.set_title('${xCol} vs ${yCol}')`,
            histogram: `vals = df['${histCol}'].dropna()\nn_bins = min(60, max(10, int(1 + 3.322 * np.log10(len(vals)))))\nax.hist(vals, bins=n_bins, color='#7c3aed', edgecolor='#a78bfa', alpha=0.85)\nax.set_xlabel('${histCol}')\nax.set_ylabel('Frequency')\nax.set_title('Distribution of ${histCol}')`,
            pie:       `counts = df['${xCol || yCol}'].value_counts().head(15)\nax.pie(counts.values, labels=counts.index, autopct='%1.1f%%', colors=sns.color_palette('viridis', len(counts)))\nax.set_title('Distribution of ${xCol || yCol}')`,
            box:       `sns.boxplot(y=df['${yCol || xCol}'], ax=ax, color='#7c3aed', flierprops=dict(marker='o', alpha=0.5))\nax.set_ylabel('${yCol || xCol}')\nax.set_title('Box Plot — ${yCol || xCol}')`,
            heatmap:   `corr = df.select_dtypes(include='number').corr()\nsns.heatmap(corr, annot=True, fmt='.2f', cmap='RdYlGn', ax=ax, linewidths=0.5, square=True)\nax.set_title('Correlation Heatmap')`,
            area:      `ax.fill_between(range(len(df)), ${ydf}, alpha=0.25, color='#7c3aed')\nax.plot(range(len(df)), ${ydf}, color='#7c3aed', lw=2.5)\nax.set_xlabel('Index')\nax.set_ylabel('${yCol}')\nax.set_title('${yCol} Area Chart')`,
            violin:    `sns.violinplot(y=df['${yCol || xCol}'], ax=ax, color='#7c3aed', inner='box', cut=0)\nax.set_ylabel('${yCol || xCol}')\nax.set_title('Violin Plot — ${yCol || xCol}')`,
            bubble:    `sizes = (df['${yCol}'].abs() / df['${yCol}'].abs().max()) * 500\nax.scatter(${xdf}, ${ydf}, s=sizes, c=${ydf}, cmap='viridis', alpha=0.7, edgecolors='white', lw=0.5)\nax.set_xlabel('${xCol}')\nax.set_ylabel('${yCol}')\nax.set_title('${xCol} vs ${yCol} — Bubble Chart')`,
        };
        return hdr + (bodies[type] || `# Chart type: ${type}`) + ftr;
    }


    // ========== MULTI-CELL NOTEBOOK ===========

    function syncWelcome() {
        if (!dom.notebookWelcome) return;
        dom.notebookWelcome.style.display = state.notebookCells.length === 0 ? 'flex' : 'none';
    }

    function addNotebookCell(type, xCol, yCol) {
        if (!state.data.length) { showToast('Upload a dataset first', 'error'); return; }
        // Use current axis selectors if not given
        const chartType = type || null;
        const ax = xCol || dom.xAxisSelect.value;
        const ay = yCol || dom.yAxisSelect.value;

        // Id
        state.cellCounter++;
        const cellId = 'nbcell-' + state.cellCounter;
        state.execCounter++;
        const execN = state.execCounter;

        // Cell info
        const axisInfo = ax && ay ? `x=${ax} · y=${ay}` : ax ? `col=${ax}` : ay ? `col=${ay}` : 'no columns';
        const typeLabel = chartType || 'empty';
        const typeIcon = CHART_ICONS[typeLabel] || 'chart-bar';

        // Build DOM
        const wrapper = document.createElement('div');
        wrapper.className = 'nb-cell-wrapper';
        wrapper.id = cellId;

        wrapper.innerHTML = `
          <div class="nb-cell-card" id="${cellId}-card">
            <div class="nb-cell-header">
              <span class="nb-cell-num">In [${execN}]</span>
              ${chartType ? `<span class="nb-cell-type-badge"><i class="fas fa-${typeIcon}"></i> ${chartType}</span>` : ''}
              <span class="nb-cell-axis-info">${axisInfo}</span>
              <div class="nb-cell-actions">
                <button class="nb-cell-btn run-cell-btn" title="Re-run cell" data-action="run" data-cid="${cellId}"><i class="fas fa-play"></i></button>
                <button class="nb-cell-btn" title="Zoom In" data-action="zoomin" data-cid="${cellId}"><i class="fas fa-search-plus"></i></button>
                <button class="nb-cell-btn" title="Zoom Out" data-action="zoomout" data-cid="${cellId}"><i class="fas fa-search-minus"></i></button>
                <button class="nb-cell-btn open-tab-btn" title="Open chart in new tab" data-action="opentab" data-cid="${cellId}"><i class="fas fa-external-link-alt"></i></button>
                <button class="nb-cell-btn" title="Toggle Python code" data-action="togglecode" data-cid="${cellId}"><i class="fas fa-code"></i></button>
                <button class="nb-cell-btn delete-btn" title="Delete cell" data-action="delete" data-cid="${cellId}"><i class="fas fa-times"></i></button>
              </div>
            </div>
            <!-- Python code block (In[]) -->
            <div class="nb-code-block" id="${cellId}-code">
              <div class="nb-code-toolbar">
                <span class="nb-code-label">In [${execN}]</span>
                <span style="flex:1"></span>
                <button class="nb-code-copy-btn" data-action="copycode" data-cid="${cellId}"><i class="fas fa-copy"></i> Copy</button>
                <button class="nb-code-copy-btn" data-action="runcode" data-cid="${cellId}"><i class="fas fa-play"></i> Run</button>
              </div>
              <textarea class="nb-python-editor" id="${cellId}-editor" spellcheck="false" placeholder="# Python code..."></textarea>
            </div>
            <!-- Chart output (Out[]) -->
            <div class="nb-chart-area" id="${cellId}-chart"></div>
          </div>`;

        // Add-cell divider below
        const divider = document.createElement('div');
        divider.className = 'add-cell-divider';
        divider.innerHTML = `<div class="divider-line"></div><button class="add-cell-btn"><i class="fas fa-plus"></i> Add Cell Below</button><div class="divider-line"></div>`;
        divider.onclick = () => {
            // Insert a new blank cell after this one
            addNotebookCell();
        };

        dom.notebookBody.appendChild(wrapper);
        dom.notebookBody.appendChild(divider);

        // Store cell record
        const cellRecord = { id: cellId, type: chartType, xCol: ax, yCol: ay, execN };
        state.notebookCells.push(cellRecord);
        syncWelcome();

        // Render chart if type given
        if (chartType) {
            const chartEl = document.getElementById(cellId + '-chart');
            // Brief delay so DOM is laid out
            setTimeout(() => {
                try {
                    const cfg = buildChartConfig(chartType, ax, ay, chartEl);
                    if (!cfg) return;
                    Plotly.newPlot(chartEl, cfg.traces, cfg.layout, cfg.config);
                    cellRecord.plotlyEl = chartEl;
                    // SFX on click
                    chartEl.addEventListener('click', triggerChartSFX);
                } catch (e) { showToast('Chart error: ' + e.message, 'error'); }

                // Generate Python code
                const code = generatePythonCode(chartType, ax, ay);
                const editor = document.getElementById(cellId + '-editor');
                if (editor) editor.value = code;
            }, 80);
        }

        // Wire cell action buttons
        wrapper.addEventListener('click', e => {
            const btn = e.target.closest('[data-action]');
            if (!btn) return;
            const action = btn.dataset.action, cid = btn.dataset.cid;
            handleCellAction(action, cid, cellRecord);
        });
        divider.querySelector('.add-cell-btn').addEventListener('click', e => { e.stopPropagation(); addNotebookCell(); });

        // Activate / scroll into view
        setActiveCell(cellId);
        setTimeout(() => wrapper.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 150);
        state.currentChart = chartType;
        if (chartType) showToast(`${chartType} chart added to notebook`, 'success');
    }

    function handleCellAction(action, cellId, cellRecord) {
        const chartEl = document.getElementById(cellId + '-chart');
        const codeEl = document.getElementById(cellId + '-code');
        const editor = document.getElementById(cellId + '-editor');
        switch (action) {
            case 'run':
                if (!cellRecord.type) { showToast('No chart type set', 'error'); return; }
                try {
                    const cfg = buildChartConfig(cellRecord.type, cellRecord.xCol, cellRecord.yCol, chartEl);
                    if (!cfg) return;
                    Plotly.react(chartEl, cfg.traces, cfg.layout, cfg.config);
                    showToast('Cell re-run ✓', 'success');
                } catch (e) { showToast('Error: ' + e.message, 'error'); }
                break;
            case 'zoomin':
                try { Plotly.relayout(chartEl, {'xaxis.range': nbZoomAxis(chartEl,'xaxis',0.7),'yaxis.range': nbZoomAxis(chartEl,'yaxis',0.7)}); } catch(e){}
                break;
            case 'zoomout':
                try { Plotly.relayout(chartEl, {'xaxis.range': nbZoomAxis(chartEl,'xaxis',1.4),'yaxis.range': nbZoomAxis(chartEl,'yaxis',1.4)}); } catch(e){}
                break;
            case 'opentab':
                openCellInTab(cellRecord, chartEl, editor ? editor.value : '');
                break;
            case 'togglecode':
                if (codeEl) codeEl.classList.toggle('collapsed');
                break;
            case 'copycode':
                if (editor) navigator.clipboard.writeText(editor.value).then(() => showToast('Code copied!','success')).catch(()=>{});
                break;
            case 'runcode':
                if (editor) parsePythonCode(editor.value);
                break;
            case 'delete':
                deleteCell(cellId);
                break;
        }
    }

    function nbZoomAxis(el, axis, factor) {
        try { const l=el.layout; if(!l||!l[axis])return undefined; const r=l[axis].range; if(!r||r.length<2)return undefined; const mid=(r[0]+r[1])/2,half=(r[1]-r[0])/2*factor; return [mid-half,mid+half]; } catch(e){ return undefined; }
    }

    function setActiveCell(cellId) {
        document.querySelectorAll('.nb-cell-card').forEach(c => c.classList.remove('cell-active'));
        const card = document.getElementById(cellId + '-card');
        if (card) card.classList.add('cell-active');
    }

    function deleteCell(cellId) {
        const wrapper = document.getElementById(cellId);
        if (wrapper) {
            // Also remove the divider after it
            const next = wrapper.nextSibling;
            if (next && next.classList && next.classList.contains('add-cell-divider')) next.remove();
            wrapper.remove();
        }
        state.notebookCells = state.notebookCells.filter(c => c.id !== cellId);
        syncWelcome();
        showToast('Cell removed', 'info');
    }

    function clearAllCells() {
        if (!state.notebookCells.length) return;
        // Remove cell wrappers and dividers
        dom.notebookBody.querySelectorAll('.nb-cell-wrapper, .add-cell-divider').forEach(el => el.remove());
        state.notebookCells = [];
        state.currentChart = null;
        syncWelcome();
        showToast('Notebook cleared', 'info');
    }

    // Open chart in new browser tab (Google Colab "open in tab" style)
    function openCellInTab(cellRecord, chartEl, pyCode) {
        try {
            const title = cellRecord.type ? `${cellRecord.type} — ${cellRecord.xCol || ''} vs ${cellRecord.yCol || ''}` : 'Notebook Cell';
            // Capture Plotly chart as image
            Plotly.toImage(chartEl, { format: 'png', width: 1200, height: 700 }).then(imgSrc => {
                const win = window.open('', '_blank');
                if (!win) { showToast('Pop-up blocked — allow pop-ups for this site', 'error'); return; }
                win.document.write(`<!DOCTYPE html><html lang="en"><head>
<meta charset="UTF-8"><title>${title}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{background:#06060e;color:#f1f5f9;font-family:'Inter',sans-serif;min-height:100vh;padding:32px}
h1{font-size:22px;font-weight:700;margin-bottom:4px}
.sub{font-size:13px;color:#94a3b8;margin-bottom:28px}
.chart-img{width:100%;border-radius:14px;border:1px solid rgba(124,58,237,0.2);box-shadow:0 8px 40px rgba(0,0,0,0.5)}
.code-section{margin-top:28px;background:#1e1e2e;border-radius:12px;overflow:hidden;border:1px solid rgba(255,255,255,0.08)}
.code-header{display:flex;align-items:center;padding:10px 16px;background:rgba(255,255,255,0.04);border-bottom:1px solid rgba(255,255,255,0.06)}
.code-label{font-family:'JetBrains Mono',monospace;font-size:11px;font-weight:700;color:#1565c0}
.copy-btn{margin-left:auto;background:none;border:1px solid rgba(255,255,255,0.15);color:#94a3b8;padding:4px 14px;border-radius:6px;cursor:pointer;font-size:12px;font-family:'Inter',sans-serif}
.copy-btn:hover{background:rgba(255,255,255,0.1);color:#f1f5f9}
pre{padding:16px;font-family:'JetBrains Mono',monospace;font-size:13px;color:#a5d6a7;overflow-x:auto;line-height:1.7;white-space:pre-wrap}
.badge{display:inline-flex;align-items:center;gap:6px;padding:4px 14px;background:linear-gradient(135deg,#7c3aed,#06b6d4);border-radius:20px;font-size:11px;font-weight:700;color:#fff;margin-bottom:16px}
</style></head><body>
<span class="badge">📊 ${cellRecord.type || 'Chart'}</span>
<h1>${title}</h1>
<p class="sub">Generated by DataMining AI • ${new Date().toLocaleString()}</p>
<img src="${imgSrc}" class="chart-img" alt="${title}">
${pyCode ? `<div class="code-section">
  <div class="code-header">
    <span class="code-label">In [${cellRecord.execN}] Python</span>
    <button class="copy-btn" onclick="navigator.clipboard.writeText(document.getElementById('pycode').innerText).then(()=>{this.textContent='Copied!';setTimeout(()=>this.textContent='Copy',2000)})">Copy</button>
  </div>
  <pre id="pycode">${escapeHtml(pyCode)}</pre>
</div>` : ''}
</body></html>`);
                win.document.close();
            }).catch(() => { showToast('Could not capture chart image', 'error'); });
        } catch(e) { showToast('Open in tab failed: ' + e.message, 'error'); }
    }

    function escapeHtml(t) { return t.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

    // Toggle notebook expand (full viewport)
    function toggleNotebookExpand() {
        const panel = document.querySelector('.chart-panel');
        if (!panel) return;
        state.notebookExpanded = !state.notebookExpanded;
        panel.classList.toggle('notebook-expanded', state.notebookExpanded);
        const icon = dom.fullscreenChart.querySelector('i');
        icon.classList.toggle('fa-expand', !state.notebookExpanded);
        icon.classList.toggle('fa-compress', state.notebookExpanded);
        // Resize all plotly charts
        setTimeout(() => {
            document.querySelectorAll('.nb-chart-area').forEach(el => { try { Plotly.Plots.resize(el); } catch(e){} });
        }, 200);
    }

    // generateChart is now the "add to notebook" function
    function generateChart(type) {
        const xCol = dom.xAxisSelect.value, yCol = dom.yAxisSelect.value;
        const needsTwo = ['bar','line','scatter','area','bubble'].includes(type);
        if (needsTwo && (!xCol || !yCol)) { showToast('Select both X and Y axis columns', 'error'); return; }
        if (!needsTwo && !xCol && !yCol) { showToast('Select at least one column', 'error'); return; }
        addNotebookCell(type, xCol, yCol);
    }

    // Resize all cells on window resize
    window.addEventListener('resize', () => {
        document.querySelectorAll('.nb-chart-area').forEach(el => { try { Plotly.Plots.resize(el); } catch(e){} });
    });

    // ===== CHART SFX =====
    function triggerChartSFX(e) {
        if (!state.currentChart) return;
        const rect = dom.chartSfxOverlay.getBoundingClientRect();
        const x = e.clientX - rect.left, y = e.clientY - rect.top;
        const colors = ['#7c3aed', '#06b6d4', '#10b981', '#f59e0b', '#f43f5e', '#a78bfa'];
        for (let i = 0; i < 8; i++) {
            const p = document.createElement('div'); p.className = 'sfx-particle';
            const angle = (Math.PI * 2 / 8) * i, dist = 30 + Math.random() * 40;
            p.style.cssText = `left:${x}px;top:${y}px;background:${colors[i % colors.length]};--tx:${Math.cos(angle) * dist}px;--ty:${Math.sin(angle) * dist}px;`;
            dom.chartSfxOverlay.appendChild(p);
            setTimeout(() => p.remove(), 700);
        }
        const ring = document.createElement('div'); ring.className = 'sfx-ring';
        ring.style.cssText = `left:${x - 5}px;top:${y - 5}px;`;
        dom.chartSfxOverlay.appendChild(ring);
        setTimeout(() => ring.remove(), 600);
    }

    // ===== NULL FILLING =====
    function fillNulls(method) {
        if (!state.data.length) return;
        let filled = 0;
        if (method === 'drop') {
            const before = state.data.length;
            state.data = state.data.filter(r => state.columns.every(c => r[c] != null && r[c] !== ''));
            filled = before - state.data.length;
            showToast(`Dropped ${filled} rows`, 'success');
        } else {
            state.columns.forEach(col => {
                const vals = getVals(col);
                if (method === 'ffill' || method === 'bfill') {
                    const d = method === 'bfill' ? [...state.data].reverse() : state.data;
                    let last = null;
                    d.forEach(r => { if (r[col] != null && r[col] !== '') last = r[col]; else if (last !== null) { r[col] = last; filled++; } });
                    return;
                }
                let fv;
                if (method === 'mean' && state.columnTypes[col] === 'numeric') fv = mean(vals.filter(v => typeof v === 'number'));
                else if (method === 'median' && state.columnTypes[col] === 'numeric') fv = median(vals.filter(v => typeof v === 'number'));
                else if (method === 'mode') fv = mode(vals);
                else if (method === 'zero') fv = state.columnTypes[col] === 'numeric' ? 0 : '';
                if (fv != null) state.data.forEach(r => { if (r[col] == null || r[col] === '') { r[col] = typeof fv === 'number' ? Number(fv.toFixed(4)) : fv; filled++; } });
            });
            showToast(`Filled ${filled} nulls using ${method}`, 'success');
        }
        updateSummary(); renderTable();
    }

    // ===== STATISTICS =====
    function mean(a) { const n = a.filter(v => typeof v === 'number' && !isNaN(v)); return n.length ? n.reduce((s, v) => s + v, 0) / n.length : 0; }
    function median(a) { const n = a.filter(v => typeof v === 'number').sort((a, b) => a - b); if (!n.length) return 0; const m = Math.floor(n.length / 2); return n.length % 2 ? n[m] : (n[m - 1] + n[m]) / 2; }
    function mode(a) { const f = {}; a.forEach(v => { if (v != null && v !== '') f[v] = (f[v] || 0) + 1; }); let mx = 0, mv = null; Object.entries(f).forEach(([v, c]) => { if (c > mx) { mx = c; mv = v; } }); return mv; }
    function stdev(a) { const n = a.filter(v => typeof v === 'number'); if (n.length < 2) return 0; const m = mean(n); return Math.sqrt(n.reduce((s, v) => s + Math.pow(v - m, 2), 0) / (n.length - 1)); }
    function pctile(a, p) { const s = [...a].sort((a, b) => a - b), i = (p / 100) * (s.length - 1), l = Math.floor(i), u = Math.ceil(i); return l === u ? s[l] : s[l] + (s[u] - s[l]) * (i - l); }
    function pearsonCorr(a, b) {
        const na = a.filter(v => typeof v === 'number'), nb = b.filter(v => typeof v === 'number'), len = Math.min(na.length, nb.length);
        if (len < 2) return 0; const x = na.slice(0, len), y = nb.slice(0, len), mx = mean(x), my = mean(y);
        let num = 0, dx2 = 0, dy2 = 0; for (let i = 0; i < len; i++) { const dx = x[i] - mx, dy = y[i] - my; num += dx * dy; dx2 += dx * dx; dy2 += dy * dy; }
        const den = Math.sqrt(dx2 * dy2); return den === 0 ? 0 : num / den;
    }

    function descriptiveStats() {
        const numCols = state.columns.filter(c => state.columnTypes[c] === 'numeric');
        if (!numCols.length) { showToast('No numeric columns', 'error'); return; }
        let html = '<table class="stats-table"><thead><tr><th>Stat</th>' + numCols.map(c => `<th>${c}</th>`).join('') + '</tr></thead><tbody>';
        const stats = ['Count', 'Mean', 'Std', 'Min', '25%', '50%', '75%', 'Max'];
        const fns = [v => v.length, v => mean(v).toFixed(4), v => stdev(v).toFixed(4), v => Math.min(...v).toFixed(4), v => pctile(v, 25).toFixed(4), v => median(v).toFixed(4), v => pctile(v, 75).toFixed(4), v => Math.max(...v).toFixed(4)];
        stats.forEach((name, i) => { html += `<tr><td style="font-weight:600;color:var(--text-secondary)">${name}</td>` + numCols.map(c => { const v = getVals(c).filter(x => typeof x === 'number'); return `<td>${fns[i](v)}</td>`; }).join('') + '</tr>'; });
        html += '</tbody></table>';
        showStatsPanel(html);
    }

    function showDataInfo() {
        if (!state.data.length) return;
        const total = state.data.length * state.columns.length, nulls = countNulls(), mem = (JSON.stringify(state.data).length / 1024).toFixed(1);
        let html = `<div class="data-info-grid"><div class="info-card"><div class="label">Rows</div><div class="value">${state.data.length}</div></div><div class="info-card"><div class="label">Columns</div><div class="value">${state.columns.length}</div></div><div class="info-card"><div class="label">Nulls</div><div class="value" style="color:var(--rose)">${nulls}</div></div><div class="info-card"><div class="label">Completeness</div><div class="value">${((1 - nulls / total) * 100).toFixed(1)}%</div></div><div class="info-card"><div class="label">Memory</div><div class="value">${mem} KB</div></div></div>`;
        html += '<table class="stats-table"><thead><tr><th>Column</th><th>Type</th><th>Non-Null</th><th>Nulls</th><th>Unique</th></tr></thead><tbody>';
        state.columns.forEach(c => { const v = getVals(c), nc = state.data.length - v.length; html += `<tr><td style="font-weight:600">${c}</td><td><span class="col-type-badge ${state.columnTypes[c]}">${state.columnTypes[c]}</span></td><td>${v.length}</td><td style="${nc ? 'color:var(--rose)' : ''}">${nc}</td><td>${new Set(v).size}</td></tr>`; });
        html += '</tbody></table>'; showStatsPanel(html);
    }

    function detectOutliers() {
        const col = dom.xAxisSelect.value || dom.yAxisSelect.value;
        if (!col || state.columnTypes[col] !== 'numeric') { showToast('Select a numeric column', 'error'); return; }
        const vals = getVals(col).filter(v => typeof v === 'number'), q1 = pctile(vals, 25), q3 = pctile(vals, 75), iqr = q3 - q1, lo = q1 - 1.5 * iqr, hi = q3 + 1.5 * iqr;
        const outliers = vals.filter(v => v < lo || v > hi);
        let html = `<div class="regression-output"><h4><i class="fas fa-exclamation-circle"></i> Outliers — ${col} (IQR)</h4>`;
        [['Q1', q1], ['Q3', q3], ['IQR', iqr], ['Lower', lo], ['Upper', hi], ['Outliers', outliers.length]].forEach(([l, v]) => { html += `<div class="stat-row"><span class="stat-label">${l}</span><span class="stat-value">${typeof v === 'number' ? v.toFixed(4) : v}</span></div>`; });
        html += '</div>'; if (outliers.length && outliers.length <= 50) html += `<p style="margin-top:12px;font-size:12px;color:var(--text-secondary)">Values: <span style="color:var(--rose);font-family:var(--font-mono)">${outliers.join(', ')}</span></p>`;
        showStatsPanel(html); showToast(`${outliers.length} outliers in ${col}`, 'info');
    }

    function normalizeData() {
        const numCols = state.columns.filter(c => state.columnTypes[c] === 'numeric');
        if (!numCols.length) { showToast('No numeric columns', 'error'); return; }
        numCols.forEach(col => { const vals = state.data.map(r => Number(r[col])).filter(v => !isNaN(v)), min = Math.min(...vals), max = Math.max(...vals), range = max - min; if (!range) return; state.data.forEach(r => { const v = Number(r[col]); if (!isNaN(v)) r[col] = Number(((v - min) / range).toFixed(6)); }); });
        renderTable(); showToast(`Normalized ${numCols.length} columns`, 'success');
    }

    // linearRegression uses addNotebookCell internally via generateChart alias
    function linearRegression() {
        const xCol = dom.xAxisSelect.value, yCol = dom.yAxisSelect.value;
        if (!xCol || !yCol) { showToast('Select X and Y columns', 'error'); return; }
        if (state.columnTypes[xCol] !== 'numeric' || state.columnTypes[yCol] !== 'numeric') { showToast('Both must be numeric', 'error'); return; }
        const xV = [], yV = []; state.data.forEach(r => { const x = Number(r[xCol]), y = Number(r[yCol]); if (!isNaN(x) && !isNaN(y)) { xV.push(x); yV.push(y); } });
        if (xV.length < 2) { showToast('Not enough data', 'error'); return; }
        const n = xV.length, sx = xV.reduce((a,b)=>a+b,0), sy = yV.reduce((a,b)=>a+b,0), sxy = xV.reduce((s,x,i)=>s+x*yV[i],0), sxx = xV.reduce((s,x)=>s+x*x,0);
        const slope = (n*sxy-sx*sy)/(n*sxx-sx*sx), intercept = (sy-slope*sx)/n;
        const yMean=sy/n, ssT=yV.reduce((s,y)=>s+Math.pow(y-yMean,2),0), ssR=yV.reduce((s,y,i)=>s+Math.pow(y-(slope*xV[i]+intercept),2),0), r2=1-ssR/ssT;
        // Add regression as a notebook cell
        state.cellCounter++; state.execCounter++;
        const cellId = 'nbcell-' + state.cellCounter, execN = state.execCounter;
        const wrapper = document.createElement('div'); wrapper.className='nb-cell-wrapper'; wrapper.id=cellId;
        wrapper.innerHTML = `<div class="nb-cell-card" id="${cellId}-card"><div class="nb-cell-header"><span class="nb-cell-num">In [${execN}]</span><span class="nb-cell-type-badge"><i class="fas fa-project-diagram"></i> Regression</span><span class="nb-cell-axis-info">x=${xCol} · y=${yCol}</span><div class="nb-cell-actions"><button class="nb-cell-btn delete-btn" data-action="delete" data-cid="${cellId}"><i class="fas fa-times"></i></button></div></div><div class="nb-chart-area" id="${cellId}-chart"></div></div>`;
        const divider = document.createElement('div'); divider.className='add-cell-divider'; divider.innerHTML='<div class="divider-line"></div><button class="add-cell-btn"><i class="fas fa-plus"></i> Add Cell Below</button><div class="divider-line"></div>'; divider.onclick=()=>addNotebookCell();
        dom.notebookBody.appendChild(wrapper); dom.notebookBody.appendChild(divider);
        const cellRecord = {id:cellId,type:'regression',xCol,yCol,execN}; state.notebookCells.push(cellRecord); syncWelcome();
        wrapper.addEventListener('click', e=>{ const btn=e.target.closest('[data-action]'); if(btn&&btn.dataset.action==='delete') deleteCell(cellId); });
        setTimeout(()=>{
            const chartEl=document.getElementById(cellId+'-chart');
            const cc=getChartColors();
            Plotly.newPlot(chartEl,[
                {x:xV,y:yV,type:'scatter',mode:'markers',name:'Data',marker:{color:'#06b6d4',size:7,opacity:0.7}},
                {x:[Math.min(...xV),Math.max(...xV)],y:[slope*Math.min(...xV)+intercept,slope*Math.max(...xV)+intercept],type:'scatter',mode:'lines',name:'Regression',line:{color:'#f43f5e',width:3}}
            ],{paper_bgcolor:cc.paper,plot_bgcolor:cc.bg,font:{family:'Inter',color:cc.text},margin:{t:50,r:30,b:60,l:60},xaxis:{title:xCol,gridcolor:cc.grid},yaxis:{title:yCol,gridcolor:cc.grid},title:{text:`y = ${slope.toFixed(4)}x + ${intercept.toFixed(4)}`,font:{size:14,color:cc.title}},showlegend:true,dragmode:'zoom',autosize:true},{responsive:true,scrollZoom:true,displaylogo:false});
        },80);
        setActiveCell(cellId);
        showStatsPanel(`<div class="regression-output"><h4><i class="fas fa-project-diagram"></i> Linear Regression</h4>${[['Equation',`y = ${slope.toFixed(6)}x + ${intercept.toFixed(6)}`],['Slope',slope.toFixed(6)],['Intercept',intercept.toFixed(6)],['R²',r2.toFixed(6)],['Pearson r',pearsonCorr(xV,yV).toFixed(6)],['Points',n]].map(([l,v])=>`<div class="stat-row"><span class="stat-label">${l}</span><span class="stat-value">${v}</span></div>`).join('')}</div>`);
    }

    function showStatsPanel(html) { dom.statsContent.innerHTML = html; dom.statsPanel.style.display = 'block'; }
    function clearChart() { clearAllCells(); }

    // Legacy toggleFullscreen - now toggles notebook expand
    function toggleFullscreen() { toggleNotebookExpand(); }

    let fullscreenBackdrop = null;
    let fullscreenHint = null;

    function createFullscreenElements() {
        if (!fullscreenBackdrop) {
            fullscreenBackdrop = document.createElement('div');
            fullscreenBackdrop.className = 'fullscreen-backdrop';
            fullscreenBackdrop.addEventListener('click', () => toggleFullscreen());
            document.body.appendChild(fullscreenBackdrop);
        }
        if (!fullscreenHint) {
            fullscreenHint = document.createElement('div');
            fullscreenHint.className = 'fullscreen-close-hint';
            fullscreenHint.innerHTML = 'Press <kbd>Esc</kbd> to exit fullscreen';
            document.body.appendChild(fullscreenHint);
        }
    }

    function toggleFullscreen() {
        const p = $('.chart-panel');
        createFullscreenElements();
        const isEntering = !p.classList.contains('fullscreen');

        p.classList.toggle('fullscreen');
        dom.fullscreenChart.querySelector('i').classList.toggle('fa-expand');
        dom.fullscreenChart.querySelector('i').classList.toggle('fa-compress');

        if (isEntering) {
            fullscreenBackdrop.classList.add('active');
            document.body.style.overflow = 'hidden';
            document.addEventListener('keydown', fullscreenEscHandler);
            // Show hint briefly
            fullscreenHint.classList.add('visible');
            setTimeout(() => { if (fullscreenHint) fullscreenHint.classList.remove('visible'); }, 3000);
        } else {
            fullscreenBackdrop.classList.remove('active');
            document.body.style.overflow = '';
            document.removeEventListener('keydown', fullscreenEscHandler);
            fullscreenHint.classList.remove('visible');
        }

        // Resize Plotly chart to fit new dimensions
        if (state.currentChart) {
            setTimeout(() => {
                try { Plotly.Plots.resize(dom.chartArea); } catch (e) { }
            }, 200);
        }
    }

    function fullscreenEscHandler(e) {
        if (e.key === 'Escape') {
            e.preventDefault();
            const p = $('.chart-panel');
            if (p.classList.contains('fullscreen')) {
                toggleFullscreen();
            }
        }
    }

    // ===== PYTHON CODE GENERATION =====
    function generatePythonCode(type, xCol, yCol) {
        const fn = state.fileName || 'data.csv';
        const rows = state.data.length;
        const cols = state.columns.length;
        let imports = `import pandas as pd\nimport matplotlib.pyplot as plt\nimport numpy as np`;
        let needsSeaborn = ['box', 'heatmap', 'violin'].includes(type);
        if (needsSeaborn) imports += `\nimport seaborn as sns`;

        let code = `${imports}\n\n# Load dataset (${rows} rows × ${cols} columns)\ndf = pd.read_csv('${fn}')\nprint(f"Dataset shape: {df.shape}")\nprint(f"Columns: {list(df.columns)}")\n\n`;

        switch (type) {
            case 'bar':
                code += `# ── Bar Chart ──────────────────────────────────\nfig, ax = plt.subplots(figsize=(12, 6))\ncolors = ['#7c3aed', '#06b6d4', '#10b981', '#f59e0b', '#f43f5e', '#a78bfa', '#34d399', '#fb923c', '#e879f9']\nbar_colors = [colors[i % len(colors)] for i in range(len(df['${xCol}']))]\n\nax.bar(df['${xCol}'], df['${yCol}'], color=bar_colors, alpha=0.85, edgecolor='white', linewidth=0.5)\nax.set_xlabel('${xCol}', fontsize=12, fontweight='bold')\nax.set_ylabel('${yCol}', fontsize=12, fontweight='bold')\nax.set_title('${yCol} by ${xCol}', fontsize=16, fontweight='bold', pad=15)\nax.tick_params(axis='x', rotation=45)\nax.grid(axis='y', alpha=0.3, linestyle='--')\nax.spines[['top', 'right']].set_visible(False)\nplt.tight_layout()\nplt.show()`;
                break;
            case 'line':
                code += `# ── Line Chart ─────────────────────────────────\nfig, ax = plt.subplots(figsize=(12, 6))\n\nax.plot(df['${xCol}'], df['${yCol}'], color='#7c3aed', linewidth=2.5,\n        marker='o', markersize=5, markerfacecolor='#a78bfa',\n        markeredgecolor='white', markeredgewidth=1)\nax.fill_between(df['${xCol}'], df['${yCol}'], alpha=0.08, color='#7c3aed')\nax.set_xlabel('${xCol}', fontsize=12, fontweight='bold')\nax.set_ylabel('${yCol}', fontsize=12, fontweight='bold')\nax.set_title('${yCol} vs ${xCol}', fontsize=16, fontweight='bold', pad=15)\nax.grid(True, alpha=0.3, linestyle='--')\nax.spines[['top', 'right']].set_visible(False)\nplt.tight_layout()\nplt.show()`;
                break;
            case 'scatter':
                code += `# ── Scatter Plot ───────────────────────────────\nfig, ax = plt.subplots(figsize=(12, 6))\n\nscatter = ax.scatter(df['${xCol}'], df['${yCol}'], c='#06b6d4', s=60,\n                      alpha=0.7, edgecolors='white', linewidth=0.5)\nax.set_xlabel('${xCol}', fontsize=12, fontweight='bold')\nax.set_ylabel('${yCol}', fontsize=12, fontweight='bold')\nax.set_title('${xCol} vs ${yCol}', fontsize=16, fontweight='bold', pad=15)\nax.grid(True, alpha=0.3, linestyle='--')\nax.spines[['top', 'right']].set_visible(False)\n\n# Add correlation coefficient\nfrom scipy import stats\nr, p = stats.pearsonr(df['${xCol}'].dropna(), df['${yCol}'].dropna())\nax.annotate(f'r = {r:.4f} (p = {p:.4f})', xy=(0.05, 0.95),\n            xycoords='axes fraction', fontsize=10, color='#64748b')\nplt.tight_layout()\nplt.show()`;
                break;
            case 'histogram':
                code += `# ── Histogram ──────────────────────────────────\ncol = '${xCol || yCol}'\nfig, ax = plt.subplots(figsize=(12, 6))\n\ndata = df[col].dropna()\nn, bins, patches = ax.hist(data, bins=30, color='#7c3aed', alpha=0.8,\n                           edgecolor='white', linewidth=0.8)\nax.axvline(data.mean(), color='#f43f5e', linestyle='--', linewidth=2, label=f'Mean: {data.mean():.2f}')\nax.axvline(data.median(), color='#06b6d4', linestyle='--', linewidth=2, label=f'Median: {data.median():.2f}')\nax.set_xlabel(col, fontsize=12, fontweight='bold')\nax.set_ylabel('Frequency', fontsize=12, fontweight='bold')\nax.set_title(f'Distribution of {col}', fontsize=16, fontweight='bold', pad=15)\nax.legend(fontsize=10)\nax.grid(axis='y', alpha=0.3, linestyle='--')\nax.spines[['top', 'right']].set_visible(False)\nplt.tight_layout()\nplt.show()`;
                break;
            case 'pie':
                code += `# ── Pie Chart ──────────────────────────────────\ncol = '${xCol || yCol}'\ncounts = df[col].value_counts().head(10)  # Top 10 categories\ncolors = ['#7c3aed','#06b6d4','#10b981','#f59e0b','#f43f5e',\n          '#a78bfa','#34d399','#fb923c','#e879f9','#94a3b8']\n\nfig, ax = plt.subplots(figsize=(10, 8))\nwedges, texts, autotexts = ax.pie(\n    counts.values, labels=counts.index, autopct='%1.1f%%',\n    colors=colors[:len(counts)], pctdistance=0.85,\n    wedgeprops=dict(width=0.4, edgecolor='white', linewidth=2))\nplt.setp(autotexts, size=10, weight='bold')\nax.set_title(f'Distribution of {col}', fontsize=16, fontweight='bold', pad=20)\nplt.tight_layout()\nplt.show()`;
                break;
            case 'box':
                code += `# ── Box Plot ───────────────────────────────────\nnumeric_cols = df.select_dtypes(include='number').columns[:5]\nfig, ax = plt.subplots(figsize=(12, 6))\n\nsns.boxplot(data=df[numeric_cols], palette='viridis', ax=ax,\n            flierprops=dict(marker='o', markerfacecolor='#f43f5e', markersize=5))\nax.set_title('Box Plot — Numeric Columns', fontsize=16, fontweight='bold', pad=15)\nax.tick_params(axis='x', rotation=45)\nax.grid(axis='y', alpha=0.3, linestyle='--')\nax.spines[['top', 'right']].set_visible(False)\nplt.tight_layout()\nplt.show()`;
                break;
            case 'heatmap':
                code += `# ── Correlation Heatmap ────────────────────────\nnumeric_df = df.select_dtypes(include='number')\ncorr = numeric_df.corr()\n\nfig, ax = plt.subplots(figsize=(12, 10))\nmask = np.triu(np.ones_like(corr, dtype=bool), k=1)\nsns.heatmap(corr, mask=mask, annot=True, fmt='.2f', cmap='RdBu_r',\n            center=0, vmin=-1, vmax=1, square=True,\n            linewidths=0.5, linecolor='white',\n            cbar_kws={'shrink': 0.8, 'label': 'Correlation'},\n            ax=ax)\nax.set_title('Correlation Heatmap', fontsize=16, fontweight='bold', pad=15)\nplt.tight_layout()\nplt.show()`;
                break;
            case 'area':
                code += `# ── Area Chart ─────────────────────────────────\nfig, ax = plt.subplots(figsize=(12, 6))\n\nax.fill_between(df['${xCol}'], df['${yCol}'], alpha=0.3, color='#7c3aed')\nax.plot(df['${xCol}'], df['${yCol}'], color='#7c3aed', linewidth=2)\nax.set_xlabel('${xCol}', fontsize=12, fontweight='bold')\nax.set_ylabel('${yCol}', fontsize=12, fontweight='bold')\nax.set_title('${yCol} over ${xCol}', fontsize=16, fontweight='bold', pad=15)\nax.grid(True, alpha=0.3, linestyle='--')\nax.spines[['top', 'right']].set_visible(False)\nplt.tight_layout()\nplt.show()`;
                break;
            case 'violin':
                code += `# ── Violin Plot ────────────────────────────────\ncol = '${xCol || yCol}'\nfig, ax = plt.subplots(figsize=(10, 6))\n\nsns.violinplot(y=df[col].dropna(), color='#7c3aed', inner='box',\n               linewidth=1.5, ax=ax)\nax.set_ylabel(col, fontsize=12, fontweight='bold')\nax.set_title(f'Violin Plot — {col}', fontsize=16, fontweight='bold', pad=15)\nax.grid(axis='y', alpha=0.3, linestyle='--')\nax.spines[['top', 'right']].set_visible(False)\n\n# Stats annotation\ndata = df[col].dropna()\nstats_text = f'Mean: {data.mean():.2f} | Median: {data.median():.2f} | Std: {data.std():.2f}'\nax.annotate(stats_text, xy=(0.5, -0.12), xycoords='axes fraction',\n            ha='center', fontsize=10, color='#64748b')\nplt.tight_layout()\nplt.show()`;
                break;
            case 'bubble':
                code += `# ── Bubble Chart ───────────────────────────────\nfig, ax = plt.subplots(figsize=(12, 6))\n\nsizes = df['${yCol}'].abs() / df['${yCol}'].abs().max() * 500 + 20\nscatter = ax.scatter(df['${xCol}'], df['${yCol}'], s=sizes, c=df['${yCol}'],\n                      cmap='viridis', alpha=0.7, edgecolors='white', linewidth=0.5)\nplt.colorbar(scatter, ax=ax, label='${yCol}', shrink=0.8)\nax.set_xlabel('${xCol}', fontsize=12, fontweight='bold')\nax.set_ylabel('${yCol}', fontsize=12, fontweight='bold')\nax.set_title('${xCol} vs ${yCol} (Bubble)', fontsize=16, fontweight='bold', pad=15)\nax.grid(True, alpha=0.3, linestyle='--')\nax.spines[['top', 'right']].set_visible(False)\nplt.tight_layout()\nplt.show()`;
                break;
            default:
                code += `# Chart type: ${type}\n# Code generation not available for this type`;
        }
        return code;
    }

    function updatePythonCode(type, xCol, yCol) {
        // No-op in multi-cell mode — each cell handles its own code
        state.lastPythonCode = generatePythonCode(type, xCol, yCol);
    }

    // ===== PARSE PYTHON CODE (REAL-TIME EDITING) =====
    function parsePythonCode(code) {
        if (!code || !code.trim()) return;
        try {
            // Extract chart type from comments
            let chartType = null;
            const typeMap = {
                'bar chart': 'bar', 'bar': 'bar',
                'line chart': 'line', 'line': 'line',
                'scatter plot': 'scatter', 'scatter': 'scatter',
                'histogram': 'histogram', 'hist': 'histogram',
                'pie chart': 'pie', 'pie': 'pie',
                'box plot': 'box', 'boxplot': 'box',
                'heatmap': 'heatmap', 'correlation': 'heatmap',
                'area chart': 'area', 'fill_between': 'area',
                'violin': 'violin', 'violinplot': 'violin',
                'bubble': 'bubble', 'bubble chart': 'bubble',
            };

            // Detect from plt method calls
            if (code.includes('plt.bar(')) chartType = 'bar';
            else if (code.includes('plt.hist(')) chartType = 'histogram';
            else if (code.includes('plt.pie(')) chartType = 'pie';
            else if (code.includes('plt.scatter(') && code.includes('s=')) chartType = 'bubble';
            else if (code.includes('plt.scatter(')) chartType = 'scatter';
            else if (code.includes('fill_between')) chartType = 'area';
            else if (code.includes('plt.plot(')) chartType = 'line';
            else if (code.includes('boxplot') || code.includes('box')) chartType = 'box';
            else if (code.includes('heatmap')) chartType = 'heatmap';
            else if (code.includes('violinplot') || code.includes('violin')) chartType = 'violin';
            else {
                // Try comment-based detection
                const commentMatch = code.match(/# (\w[\w ]+)/i);
                if (commentMatch) {
                    const commentLower = commentMatch[1].toLowerCase();
                    for (const [key, val] of Object.entries(typeMap)) {
                        if (commentLower.includes(key)) { chartType = val; break; }
                    }
                }
            }

            // Extract column names from df['col'] patterns
            const colMatches = [...code.matchAll(/df\['([^']+)'\]/g)].map(m => m[1]);
            const uniqueCols = [...new Set(colMatches)];

            // Determine xCol and yCol
            let xCol = dom.xAxisSelect.value;
            let yCol = dom.yAxisSelect.value;
            if (uniqueCols.length >= 2) {
                xCol = uniqueCols[0];
                yCol = uniqueCols[1];
            } else if (uniqueCols.length === 1) {
                xCol = uniqueCols[0];
                yCol = '';
            }

            // Validate columns exist in data
            if (xCol && !state.columns.includes(xCol)) { showToast(`Column "${xCol}" not found in data`, 'error'); return; }
            if (yCol && !state.columns.includes(yCol)) { showToast(`Column "${yCol}" not found in data`, 'error'); return; }

            // Update dropdowns
            if (xCol) dom.xAxisSelect.value = xCol;
            if (yCol) dom.yAxisSelect.value = yCol;

            // Extract custom title
            let customTitle = null;
            const titleMatch = code.match(/plt\.title\(['"]([^'"]+)['"]\)/) || code.match(/plt\.title\(f['"]([^'"]+)['"]\)/);
            if (titleMatch) customTitle = titleMatch[1];

            // Extract custom colors
            let customColor = null;
            const colorMatch = code.match(/color=['"]([^'"]+)['"]/);
            if (colorMatch) customColor = colorMatch[1];

            if (chartType) {
                generateChart(chartType);
                // Apply custom title and color after chart is generated
                try {
                    const updates = {};
                    if (customTitle) updates['title.text'] = customTitle;
                    if (Object.keys(updates).length) Plotly.relayout(dom.chartArea, updates);
                    if (customColor && dom.chartArea.data && dom.chartArea.data[0]) {
                        if (dom.chartArea.data[0].marker) {
                            Plotly.restyle(dom.chartArea, { 'marker.color': customColor }, [0]);
                        } else if (dom.chartArea.data[0].line) {
                            Plotly.restyle(dom.chartArea, { 'line.color': customColor }, [0]);
                        }
                    }
                } catch (e) { }
                showToast('Chart updated from code', 'success');
            } else {
                showToast('Could not detect chart type from code', 'error');
            }
        } catch (e) {
            showToast('Error parsing code: ' + e.message, 'error');
        }
    }

    // ===== TEXT ANNOTATION =====
    function addTextAnnotation() {
        const text = dom.annotationText.value.trim();
        if (!text) { showToast('Enter text to add', 'error'); return; }
        if (!state.currentChart) { showToast('Create a chart first', 'error'); return; }
        try {
            const currentAnnotations = dom.chartArea.layout?.annotations || [];
            Plotly.relayout(dom.chartArea, { annotations: [...currentAnnotations, { text, xref: 'paper', yref: 'paper', x: 0.5, y: 1.05, showarrow: false, font: { size: 14, color: getChartColors().title } }] });
            dom.textModal.style.display = 'none'; dom.annotationText.value = '';
            showToast('Annotation added', 'success');
        } catch (e) { showToast('Failed to add annotation', 'error'); }
    }

    // ===== COPY / CUT / PASTE =====
    function copyTableSelection() {
        if (!state.data.length) return;
        const text = state.columns.join('\t') + '\n' + state.data.map(r => state.columns.map(c => r[c] ?? '').join('\t')).join('\n');
        state.clipboard = text;
        navigator.clipboard.writeText(text).catch(() => { });
    }

    function pasteFromClipboard() {
        navigator.clipboard.readText().then(text => {
            if (!text.trim()) return;
            const parsed = Papa.parse(text.trim(), { header: true, dynamicTyping: true, skipEmptyLines: true });
            if (parsed.data.length) { state.data = parsed.data; state.columns = parsed.meta.fields || []; detectColumnTypes(); showWorkspace(); showToast(`Pasted ${parsed.data.length} rows`, 'success'); }
        }).catch(() => showToast('Paste not available — use Ctrl+V', 'info'));
    }

    // ===== SHEET BUILDER =====
    async function generateSheet() {
        const format = dom.sheetFormat.value;
        dom.sheetModal.style.display = 'none';
        showToast('Generating sheet...', 'info');

        if (format === 'csv') {
            const csv = Papa.unparse(state.data);
            const blob = new Blob([csv], { type: 'text/csv' });
            downloadBlob(blob, `${state.fileName || 'data'}_sheet.csv`);
            showToast('Sheet exported as CSV', 'success'); return;
        }

        const { jsPDF } = window.jspdf;
        const doc = new jsPDF('portrait', 'mm', 'a4');
        let y = 15;

        // Title page
        doc.setFontSize(24); doc.setTextColor(60); doc.text('Data Analysis Report', 14, y); y += 12;
        doc.setFontSize(11); doc.setTextColor(120); doc.text(`Dataset: ${state.fileName || 'Unknown'}`, 14, y); y += 6;
        doc.text(`Date: ${new Date().toLocaleString()}`, 14, y); y += 6;
        doc.text(`Rows: ${state.data.length} | Columns: ${state.columns.length} | Nulls: ${countNulls()}`, 14, y); y += 12;

        // Stats
        if ($('#sheetStats')?.checked) {
            const numCols = state.columns.filter(c => state.columnTypes[c] === 'numeric');
            if (numCols.length) {
                doc.setFontSize(14); doc.setTextColor(60); doc.text('Descriptive Statistics', 14, y); y += 8;
                doc.setFontSize(9); doc.setTextColor(80);
                numCols.forEach(c => { const v = getVals(c).filter(x => typeof x === 'number'); if (!v.length) return; doc.text(`${c}: mean=${mean(v).toFixed(2)}, std=${stdev(v).toFixed(2)}, min=${Math.min(...v).toFixed(2)}, max=${Math.max(...v).toFixed(2)}`, 18, y); y += 5; if (y > 270) { doc.addPage(); y = 15; } });
                y += 5;
            }
        }

        // Charts - generate each type
        const includePyCode = $('#sheetPythonCode')?.checked;
        if ($('#sheetCharts')?.checked) {
            const xCol = dom.xAxisSelect.value, yCol = dom.yAxisSelect.value;
            const chartTypes = xCol && yCol ? ['bar', 'line', 'scatter', 'area'] : (xCol || yCol ? ['histogram', 'pie', 'box', 'violin'] : []);
            for (const ct of chartTypes) {
                try {
                    generateChart(ct);
                    await new Promise(r => setTimeout(r, 500));
                    const img = await Plotly.toImage(dom.chartArea, { format: 'png', width: 1200, height: 600 });
                    if (y > 150) { doc.addPage(); y = 15; }
                    doc.setFontSize(12); doc.text(ct.charAt(0).toUpperCase() + ct.slice(1) + ' Chart', 14, y); y += 5;
                    doc.addImage(img, 'PNG', 14, y, 180, 90); y += 95;
                    // Add Python code below graph
                    if (includePyCode) {
                        const pyCode = generatePythonCode(ct, xCol, yCol);
                        if (y > 220) { doc.addPage(); y = 15; }
                        doc.setFontSize(8); doc.setTextColor(100);
                        doc.text('Python Code:', 14, y); y += 4;
                        doc.setFont('Courier', 'normal');
                        doc.setFontSize(7); doc.setTextColor(60);
                        const codeLines = pyCode.split('\n');
                        codeLines.forEach(line => {
                            if (y > 275) { doc.addPage(); y = 15; }
                            doc.text(line, 18, y); y += 3.5;
                        });
                        doc.setFont('Helvetica', 'normal');
                        y += 5;
                    }
                } catch (e) { }
            }
        }

        // Correlation
        if ($('#sheetCorr')?.checked) {
            try {
                generateChart('heatmap');
                await new Promise(r => setTimeout(r, 500));
                const img = await Plotly.toImage(dom.chartArea, { format: 'png', width: 1200, height: 600 });
                doc.addPage(); doc.setFontSize(12); doc.text('Correlation Matrix', 14, 15);
                doc.addImage(img, 'PNG', 14, 22, 180, 90);
            } catch (e) { }
        }

        doc.save(`${state.fileName || 'report'}_sheet.pdf`);
        showToast('Sheet exported as PDF', 'success');
    }



    // ===== EXPORT =====
    async function exportData(fmt) {
        // For PNG/PDF, use the first notebook cell with a chart
        const getFirstChartEl = () => {
            const areas = document.querySelectorAll('.nb-chart-area');
            for (const el of areas) { if (el.data && el.data.length) return el; }
            return null;
        };
        try {
            if (fmt === 'png') {
                const el = getFirstChartEl(); if (!el) { showToast('No chart to export', 'error'); return; }
                const img = await Plotly.toImage(el, { format: 'png', width: 1920, height: 1080 }); dlFile(img, (state.fileName || 'chart') + '.png'); showToast('PNG exported', 'success');
            }
            else if (fmt === 'pdf') {
                const el = getFirstChartEl(); if (!el) { showToast('No chart to export', 'error'); return; }
                const jsPDFmod = window.jspdf; const doc = new jsPDFmod.jsPDF('landscape');
                const img = await Plotly.toImage(el, { format: 'png', width: 1600, height: 900 });
                doc.setFontSize(18); doc.text('DataMining AI - ' + (state.fileName || 'Chart'), 14, 20);
                doc.addImage(img, 'PNG', 14, 30, 270, 150); doc.save((state.fileName || 'chart') + '.pdf'); showToast('PDF exported', 'success');
            }
            else if (fmt === 'csv') { const csv = Papa.unparse(state.data); const blob = new Blob([csv], { type: 'text/csv' }); downloadBlob(blob, (state.fileName || 'data') + '_processed.csv'); showToast('CSV exported', 'success'); }
            else if (fmt === 'json') { const blob = new Blob([JSON.stringify(state.data, null, 2)], { type: 'application/json' }); downloadBlob(blob, (state.fileName || 'data') + '.json'); showToast('JSON exported', 'success'); }
            else if (fmt === 'report') { generateSheet(); }
        } catch (e) { showToast('Export failed: ' + e.message, 'error'); }
    }

    function dlFile(url, name) { const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); }
    function downloadBlob(blob, name) { const url = URL.createObjectURL(blob); dlFile(url, name); URL.revokeObjectURL(url); }

    // ===== TOAST =====
    function showToast(msg, type) {
        if (!type) type = 'info';
        const t = document.createElement('div'); t.className = 'toast ' + type;
        const icons = { success: 'fa-check-circle', error: 'fa-times-circle', info: 'fa-info-circle' };
        t.innerHTML = '<i class="fas ' + (icons[type] || icons.info) + '"></i><span>' + msg + '</span>';
        dom.toastContainer.appendChild(t);
        setTimeout(function () { t.style.animation = 'toastOut 0.3s forwards'; setTimeout(function () { t.remove(); }, 300); }, 3500);
    }

    // ===== START =====

    document.addEventListener('DOMContentLoaded', init);

})();
