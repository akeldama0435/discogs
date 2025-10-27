// ==UserScript==
// @name         Discogs Release Track Counts Table
// @namespace    https://github.com/akeldama0435/discogs
// @version      1.5
// @description  Scrollable table, sortable, searchable, lazy-loading releases, width matches #release-tracklist > div:nth-child(2), fallback to DOM year.
// @updateURL    https://github.com/akeldama0435/discogs/blob/main/release_track_count_table.user.js
// @downloadURL  https://github.com/akeldama0435/discogs/blob/main/release_track_count_table.user.js
// @author       Akeldama
// @match        https://www.discogs.com/master/*
// @grant        GM_xmlhttpRequest
// @connect      api.discogs.com
// ==/UserScript==

(function() {
    'use strict';

    const overlayId = 'trackCountOverlay';
    let table, tbody, searchInput, tableWrapper;

    function createOverlay() {
        const overlay = document.createElement('div');
        overlay.id = overlayId;
        overlay.style.cssText = `
            background-color: #fff;
            border: 1px solid #ccc;
            box-shadow: 0 1px 5px rgba(0,0,0,0.1);
            padding: 10px;
            font-size: 14px;
            font-family: Arial, sans-serif;
            margin: 20px 0;
        `;

        // --- Collapsible header ---
        const header = document.createElement('div');
        header.style.cssText = 'font-weight:bold; cursor:pointer; margin-bottom:5px;';
        header.textContent = 'Release Track Counts (click to collapse)';
        header.addEventListener('click', () => {
            tableWrapper.style.display = tableWrapper.style.display === 'none' ? 'block' : 'none';
            searchInput.style.display = searchInput.style.display === 'none' ? 'block' : 'none';
        });
        overlay.appendChild(header);

        // --- Search input ---
        searchInput = document.createElement('input');
        searchInput.type = 'text';
        searchInput.placeholder = 'Filter by title, country, year...';
        searchInput.style.cssText = 'width:100%; margin-bottom:5px; padding:4px; border:1px solid #ccc; border-radius:3px;';
        searchInput.addEventListener('input', () => filterTable(searchInput.value));
        overlay.appendChild(searchInput);

        // --- Table wrapper ---
        tableWrapper = document.createElement('div');
        tableWrapper.style.cssText = 'overflow-y:auto; max-height:224px;';
        overlay.appendChild(tableWrapper);

        // --- Table ---
        table = document.createElement('table');
        table.style.cssText = 'width:100%; border-collapse:collapse; text-align:left;';
        tableWrapper.appendChild(table);

        const thead = document.createElement('thead');
        const headerRow = document.createElement('tr');
        ['Release', 'Country', 'Year', '# Tracks'].forEach((text, idx) => {
            const th = document.createElement('th');
            th.textContent = text;
            th.style.cssText = 'border-bottom:1px solid #ccc; padding:6px; cursor:pointer;';
            th.addEventListener('click', () => sortTable(idx));
            headerRow.appendChild(th);
        });
        thead.appendChild(headerRow);
        table.appendChild(thead);

        tbody = document.createElement('tbody');
        table.appendChild(tbody);

        // --- Adjust width to match #release-tracklist > div:nth-child(2) ---
        function adjustTableWidth() {
            const container = document.querySelector('#release-tracklist > div:nth-child(2)');
            if (container) {
                overlay.style.width = container.offsetWidth + 'px';
            }
        }

        // Initial adjustment
        adjustTableWidth();

        // Adjust on window resize
        window.addEventListener('resize', adjustTableWidth);

        return overlay;
    }

    function sortTable(colIndex) {
        const rows = Array.from(tbody.rows);
        const asc = !tbody.dataset.asc || tbody.dataset.asc === 'false';
        rows.sort((a, b) => {
            let valA = a.cells[colIndex].textContent;
            let valB = b.cells[colIndex].textContent;
            const numA = parseInt(valA), numB = parseInt(valB);
            if (!isNaN(numA) && !isNaN(numB)) { valA = numA; valB = numB; }
            return asc ? (valA > valB ? 1 : -1) : (valA < valB ? 1 : -1);
        });
        tbody.innerHTML = '';
        rows.forEach(r => tbody.appendChild(r));
        tbody.dataset.asc = asc;
    }

    function filterTable(query) {
        const q = query.toLowerCase();
        Array.from(tbody.rows).forEach(row => {
            const text = Array.from(row.cells).map(c => c.textContent.toLowerCase()).join(' ');
            row.style.display = text.includes(q) ? '' : 'none';
        });
    }

    async function fetchAllMasterVersions(masterId) {
        let page = 1;
        let allVersions = [];
        while (true) {
            const versions = await new Promise((resolve, reject) => {
                GM_xmlhttpRequest({
                    method: 'GET',
                    url: `https://api.discogs.com/masters/${masterId}/versions?per_page=100&page=${page}`,
                    onload: res => {
                        if (res.status === 200) {
                            const data = JSON.parse(res.responseText);
                            resolve(data.versions || []);
                        } else reject('Failed to fetch versions');
                    },
                    onerror: () => reject('Network error')
                });
            });
            if (!versions.length) break;
            allVersions = allVersions.concat(versions);
            if (versions.length < 100) break;
            page++;
        }
        return allVersions;
    }

    function fetchReleaseData(releaseId) {
        return new Promise(resolve => {
            GM_xmlhttpRequest({
                method: 'GET',
                url: `https://api.discogs.com/releases/${releaseId}`,
                onload: res => {
                    if (res.status === 200) {
                        const data = JSON.parse(res.responseText);
                        resolve({ tracks: data.tracklist?.length || 0, year: data.year || '' });
                    } else resolve({ tracks: 0, year: '' });
                },
                onerror: () => resolve({ tracks: 0, year: '' })
            });
        });
    }

    function getMasterYearFromDOM() {
        const timeEl = document.querySelector('.table_c5ftk > tbody:nth-child(1) > tr:nth-child(4) > td:nth-child(2) > a > time');
        return timeEl ? timeEl.textContent.trim() : 'Unknown';
    }

    async function lazyLoadReleases(versions, masterYear, batchSize = 5, delay = 200) {
        for (let i = 0; i < versions.length; i += batchSize) {
            const batch = versions.slice(i, i + batchSize);
            const dataList = await Promise.all(batch.map(v => fetchReleaseData(v.id)));
            dataList.forEach((data, idx) => {
                const row = tbody.rows[i + idx];
                row.cells[2].textContent = data.year || masterYear;
                row.cells[3].textContent = data.tracks;
            });
            await new Promise(r => setTimeout(r, delay));
        }
    }

    async function renderTable(masterId) {
        const anchor = document.querySelector('h1');
        if (!anchor) return;

        let overlay = document.getElementById(overlayId);
        if (!overlay) {
            overlay = createOverlay();
            anchor.insertAdjacentElement('afterend', overlay);
        }

        tbody.innerHTML = '';
        const versions = await fetchAllMasterVersions(masterId);
        if (!versions.length) {
            tbody.innerHTML = '<tr><td colspan="4">No versions found</td></tr>';
            return;
        }

        const masterYear = getMasterYearFromDOM();

        // Insert rows with placeholders
        versions.forEach(v => {
            const tr = document.createElement('tr');
            tr.style.borderBottom = '1px solid #eee';

            const tdRelease = document.createElement('td');
            tdRelease.style.padding = '4px';
            const a = document.createElement('a');
            a.href = `/release/${v.id}`;
            a.target = '_blank';
            a.textContent = v.title || 'Release';
            tdRelease.appendChild(a);

            const tdCountry = document.createElement('td');
            tdCountry.style.padding = '4px';
            tdCountry.textContent = v.country || '';

            const tdYear = document.createElement('td');
            tdYear.style.padding = '4px';
            tdYear.textContent = '...';

            const tdTracks = document.createElement('td');
            tdTracks.style.padding = '4px';
            tdTracks.textContent = '...';

            tr.append(tdRelease, tdCountry, tdYear, tdTracks);
            tbody.appendChild(tr);
        });

        // Start lazy loading
        lazyLoadReleases(versions, masterYear);
    }

    function getMasterId() {
        const match = window.location.pathname.match(/\/master\/(\d+)/);
        return match ? match[1] : null;
    }

    const masterId = getMasterId();
    if (!masterId) return;

    renderTable(masterId);

    // Observe for SPA navigation
    const observer = new MutationObserver(() => {
        if (!document.getElementById(overlayId)) renderTable(masterId);
    });
    observer.observe(document.body, { childList: true, subtree: true });

})();
