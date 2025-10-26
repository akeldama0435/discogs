// ==UserScript==
// @name         Discogs Release Track Count Table
// @namespace    https://github.com/akeldama0435/discogs
// @version      1.9
// @description  Collapsible, sortable table of all master versions with parallel fetching for track counts and year, search, and release links.
// @author       You
// @match        https://www.discogs.com/master/*
// @grant        GM_xmlhttpRequest
// @connect      api.discogs.com
// ==/UserScript==

(function() {
    'use strict';

    const overlayId = 'trackCountOverlay';
    let table, tbody, searchInput;

    function createOverlay() {
        const overlay = document.createElement('div');
        overlay.id = overlayId;
        overlay.style.width = '100%';
        overlay.style.backgroundColor = '#fff';
        overlay.style.border = '1px solid #ccc';
        overlay.style.boxShadow = '0 1px 5px rgba(0,0,0,0.1)';
        overlay.style.padding = '10px';
        overlay.style.fontSize = '14px';
        overlay.style.fontFamily = 'Arial, sans-serif';
        overlay.style.margin = '20px 0';

        const header = document.createElement('div');
        header.style.fontWeight = 'bold';
        header.style.cursor = 'pointer';
        header.style.marginBottom = '5px';
        header.textContent = 'Master Versions – Track Counts (click to collapse)';
        header.addEventListener('click', () => {
            table.style.display = table.style.display === 'none' ? 'table' : 'none';
            searchInput.style.display = searchInput.style.display === 'none' ? 'block' : 'none';
        });
        overlay.appendChild(header);

        searchInput = document.createElement('input');
        searchInput.type = 'text';
        searchInput.placeholder = 'Filter by title, country, year...';
        searchInput.style.width = '100%';
        searchInput.style.marginBottom = '5px';
        searchInput.style.padding = '4px';
        searchInput.style.border = '1px solid #ccc';
        searchInput.style.borderRadius = '3px';
        searchInput.addEventListener('input', () => filterTable(searchInput.value));
        overlay.appendChild(searchInput);

        table = document.createElement('table');
        table.style.width = '100%';
        table.style.borderCollapse = 'collapse';
        table.style.textAlign = 'left';
        table.style.display = 'table';

        const thead = document.createElement('thead');
        const headerRow = document.createElement('tr');

        ['Release', 'Country', 'Year', '# Tracks'].forEach((text, idx) => {
            const th = document.createElement('th');
            th.textContent = text;
            th.style.borderBottom = '1px solid #ccc';
            th.style.padding = '6px';
            th.style.cursor = 'pointer';
            th.addEventListener('click', () => sortTable(idx));
            headerRow.appendChild(th);
        });

        thead.appendChild(headerRow);
        table.appendChild(thead);

        tbody = document.createElement('tbody');
        table.appendChild(tbody);
        overlay.appendChild(table);

        const anchor = document.querySelector('button._dense_yjcsc_54:nth-child(1) > div:nth-child(1)');
        if (anchor && anchor.parentElement) {
            anchor.parentElement.insertAdjacentElement('afterend', overlay);
        } else {
            document.body.appendChild(overlay);
        }

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

    function fetchMasterVersions(masterId) {
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: 'GET',
                url: `https://api.discogs.com/masters/${masterId}/versions?per_page=100`,
                onload: function(response) {
                    if (response.status === 200) {
                        const data = JSON.parse(response.responseText);
                        resolve(data.versions || []);
                    } else {
                        reject('Failed to fetch versions from API');
                    }
                },
                onerror: () => reject('Network error fetching versions')
            });
        });
    }

    function fetchReleaseData(releaseId) {
        return new Promise((resolve) => {
            GM_xmlhttpRequest({
                method: 'GET',
                url: `https://api.discogs.com/releases/${releaseId}`,
                onload: function(response) {
                    if (response.status === 200) {
                        const data = JSON.parse(response.responseText);
                        resolve({
                            tracks: data.tracklist ? data.tracklist.length : 0,
                            year: data.year || ''
                        });
                    } else {
                        resolve({tracks: 0, year: ''});
                    }
                },
                onerror: () => resolve({tracks: 0, year: ''})
            });
        });
    }

    async function renderTable(masterId) {
        const overlay = document.getElementById(overlayId) || createOverlay();
        tbody.innerHTML = '';
        try {
            const versions = await fetchMasterVersions(masterId);

            // Create table rows first
            const rows = versions.map(v => {
                const tr = document.createElement('tr');
                tr.style.borderBottom = '1px solid #eee';

                const tdRelease = document.createElement('td');
                const a = document.createElement('a');
                a.href = `/release/${v.id}`;
                a.target = '_blank';
                a.textContent = v.title || 'Release';
                tdRelease.appendChild(a);
                tdRelease.style.padding = '4px';

                const tdCountry = document.createElement('td');
                tdCountry.textContent = v.country || '';
                tdCountry.style.padding = '4px';

                const tdYear = document.createElement('td');
                tdYear.textContent = '...';
                tdYear.style.padding = '4px';

                const tdTracks = document.createElement('td');
                tdTracks.textContent = '...';
                tdTracks.style.padding = '4px';

                tr.append(tdRelease, tdCountry, tdYear, tdTracks);
                tbody.appendChild(tr);

                return {tr, releaseId: v.id, tdYear, tdTracks};
            });

            // Fetch all release data in parallel
            const promises = rows.map(r => fetchReleaseData(r.releaseId));
            const results = await Promise.all(promises);

            results.forEach((data, idx) => {
                rows[idx].tdYear.textContent = data.year;
                rows[idx].tdTracks.textContent = data.tracks;
            });

        } catch (err) {
            tbody.innerHTML = `<tr><td colspan="4">Error: ${err}</td></tr>`;
            console.error(err);
        }
    }

    function getMasterId() {
        const match = window.location.pathname.match(/\/master\/(\d+)/);
        return match ? match[1] : null;
    }

    const masterId = getMasterId();
    if (!masterId) return;
    renderTable(masterId);

})();
