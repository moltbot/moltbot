/**
 * Security Test Report Interactive Features
 * Vanilla JS for table sorting, filtering, and expandable details
 */

(function() {
  'use strict';

  // State management
  let sortColumn = -1;
  let sortDirection = 'asc';
  const expandedRows = new Set();

  /**
   * Initialize the report interactivity
   */
  function init() {
    // Add keyboard navigation
    document.addEventListener('keydown', handleKeyboard);

    // Add click outside to collapse details
    document.addEventListener('click', handleClickOutside);
  }

  /**
   * Toggle visibility of detail row
   * @param {number} index - Row index
   */
  window.toggleDetails = function(index) {
    const detailsRow = document.getElementById('details-' + index);
    const resultRow = document.querySelector('.result-row[data-index="' + index + '"]');
    const btn = resultRow.querySelector('.expand-btn');

    if (!detailsRow) return;

    const isExpanded = detailsRow.style.display !== 'none';

    if (isExpanded) {
      detailsRow.style.display = 'none';
      resultRow.classList.remove('expanded');
      btn.textContent = 'View Details';
      expandedRows.delete(index);
    } else {
      detailsRow.style.display = 'table-row';
      resultRow.classList.add('expanded');
      btn.textContent = 'Hide Details';
      expandedRows.add(index);

      // Scroll into view if needed
      setTimeout(() => {
        detailsRow.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }, 100);
    }
  };

  /**
   * Copy text to clipboard
   * @param {HTMLElement} btn - The button element
   * @param {string} elementId - ID of element containing text to copy
   */
  window.copyToClipboard = function(btn, elementId) {
    const element = document.getElementById(elementId);
    if (!element) return;

    const text = element.textContent || element.innerText;

    navigator.clipboard.writeText(text).then(() => {
      const originalText = btn.textContent;
      btn.textContent = 'Copied!';
      btn.classList.add('copied');

      setTimeout(() => {
        btn.textContent = originalText;
        btn.classList.remove('copied');
      }, 2000);
    }).catch(err => {
      console.error('Failed to copy:', err);
      btn.textContent = 'Failed';
      setTimeout(() => {
        btn.textContent = 'Copy';
      }, 2000);
    });
  };

  /**
   * Copy all evidence for a test result
   * @param {number} index - Row index
   */
  window.copyEvidence = function(index) {
    if (typeof testData === 'undefined' || !testData[index]) return;

    const evidence = testData[index].evidence;
    if (!evidence || evidence.length === 0) return;

    const text = evidence.map((e, i) => (i + 1) + '. ' + e).join('\n');

    navigator.clipboard.writeText(text).then(() => {
      // Find the copy button and update it
      const detailsRow = document.getElementById('details-' + index);
      if (detailsRow) {
        const btn = detailsRow.querySelector('.evidence-list + .copy-btn');
        if (btn) {
          btn.textContent = 'Copied!';
          setTimeout(() => {
            btn.textContent = 'Copy All Evidence';
          }, 2000);
        }
      }
    }).catch(err => {
      console.error('Failed to copy evidence:', err);
    });
  };

  /**
   * Filter results by status and category
   */
  window.filterResults = function() {
    const statusFilter = document.getElementById('status-filter');
    const categoryFilter = document.getElementById('category-filter');

    if (!statusFilter || !categoryFilter) return;

    const status = statusFilter.value;
    const category = categoryFilter.value;

    const rows = document.querySelectorAll('.result-row');
    let visibleCount = 0;

    rows.forEach(row => {
      const rowStatus = row.dataset.status;
      const rowCategory = row.dataset.category;

      const matchStatus = status === 'all' || rowStatus === status;
      const matchCategory = category === 'all' || rowCategory === category;

      const visible = matchStatus && matchCategory;
      row.style.display = visible ? '' : 'none';

      // Also hide corresponding details row
      const index = row.dataset.index;
      const detailsRow = document.getElementById('details-' + index);
      if (detailsRow && !visible) {
        detailsRow.style.display = 'none';
        expandedRows.delete(parseInt(index));
      }

      if (visible) visibleCount++;
    });

    // Update results count if element exists
    const countEl = document.getElementById('visible-count');
    if (countEl) {
      countEl.textContent = visibleCount + ' result' + (visibleCount !== 1 ? 's' : '');
    }
  };

  /**
   * Sort table by column
   * @param {number} columnIndex - Column index to sort by
   */
  window.sortTable = function(columnIndex) {
    const table = document.getElementById('results-table');
    if (!table) return;

    const tbody = table.querySelector('tbody');
    if (!tbody) return;

    // Get all result rows (not details rows)
    const rows = Array.from(tbody.querySelectorAll('.result-row'));

    // Toggle direction if same column
    if (sortColumn === columnIndex) {
      sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
      sortColumn = columnIndex;
      sortDirection = 'asc';
    }

    // Update header indicators
    updateSortIndicators(columnIndex);

    // Sort rows
    rows.sort((a, b) => {
      const aCell = a.cells[columnIndex];
      const bCell = b.cells[columnIndex];

      if (!aCell || !bCell) return 0;

      let aValue = getCellSortValue(aCell, columnIndex);
      let bValue = getCellSortValue(bCell, columnIndex);

      // Compare based on type
      let result;
      if (typeof aValue === 'number' && typeof bValue === 'number') {
        result = aValue - bValue;
      } else {
        result = String(aValue).localeCompare(String(bValue));
      }

      return sortDirection === 'asc' ? result : -result;
    });

    // Reorder DOM
    rows.forEach(row => {
      const index = row.dataset.index;
      const detailsRow = document.getElementById('details-' + index);
      tbody.appendChild(row);
      if (detailsRow) {
        tbody.appendChild(detailsRow);
      }
    });
  };

  /**
   * Get sortable value from cell
   * @param {HTMLTableCellElement} cell - Table cell
   * @param {number} columnIndex - Column index
   * @returns {string|number} - Sortable value
   */
  function getCellSortValue(cell, columnIndex) {
    const text = cell.textContent.trim();

    // Special handling for specific columns
    switch (columnIndex) {
      case 0: // Status
        return text === 'PASS' ? 0 : 1;
      case 3: // Severity
        const severityOrder = { 'none': 0, 'low': 1, 'medium': 2, 'high': 3, 'critical': 4 };
        return severityOrder[text.toLowerCase()] || 0;
      case 4: // Duration - parse time strings
        return parseDuration(text);
      default:
        return text.toLowerCase();
    }
  }

  /**
   * Parse duration string to milliseconds
   * @param {string} str - Duration string like "1.2s" or "150ms"
   * @returns {number} - Milliseconds
   */
  function parseDuration(str) {
    const match = str.match(/^([\d.]+)(ms|s|m)?$/);
    if (!match) return 0;

    const value = parseFloat(match[1]);
    const unit = match[2] || 'ms';

    switch (unit) {
      case 's': return value * 1000;
      case 'm': return value * 60000;
      default: return value;
    }
  }

  /**
   * Update sort direction indicators in headers
   * @param {number} activeColumn - Currently sorted column
   */
  function updateSortIndicators(activeColumn) {
    const headers = document.querySelectorAll('.results-table th.sortable');

    headers.forEach((th, index) => {
      th.classList.remove('sort-asc', 'sort-desc');

      if (index === activeColumn) {
        th.classList.add('sort-' + sortDirection);
      }
    });
  }

  /**
   * Handle keyboard navigation
   * @param {KeyboardEvent} event - Keyboard event
   */
  function handleKeyboard(event) {
    // Escape closes all expanded details
    if (event.key === 'Escape') {
      expandedRows.forEach(index => {
        toggleDetails(index);
      });
    }
  }

  /**
   * Handle clicks outside details panels
   * @param {MouseEvent} event - Click event
   */
  function handleClickOutside(event) {
    // Don't close if clicking inside a details panel or on expand button
    if (event.target.closest('.details-content') ||
        event.target.closest('.expand-btn')) {
      return;
    }
  }

  /**
   * Expand all result details
   */
  window.expandAll = function() {
    const rows = document.querySelectorAll('.result-row');
    rows.forEach(row => {
      if (row.style.display !== 'none') {
        const index = parseInt(row.dataset.index);
        if (!expandedRows.has(index)) {
          toggleDetails(index);
        }
      }
    });
  };

  /**
   * Collapse all result details
   */
  window.collapseAll = function() {
    expandedRows.forEach(index => {
      toggleDetails(index);
    });
  };

  /**
   * Export current view as JSON
   */
  window.exportJson = function() {
    if (typeof testData === 'undefined') return;

    const statusFilter = document.getElementById('status-filter');
    const categoryFilter = document.getElementById('category-filter');

    let filtered = testData;

    if (statusFilter && statusFilter.value !== 'all') {
      const status = statusFilter.value === 'passed';
      filtered = filtered.filter(r => r.passed === status);
    }

    if (categoryFilter && categoryFilter.value !== 'all') {
      const category = categoryFilter.value;
      filtered = filtered.filter(r => r.category === category);
    }

    const blob = new Blob([JSON.stringify(filtered, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'security-test-results.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  /**
   * Search within test results
   * @param {string} query - Search query
   */
  window.searchResults = function(query) {
    const lowerQuery = query.toLowerCase().trim();
    const rows = document.querySelectorAll('.result-row');

    rows.forEach(row => {
      const index = parseInt(row.dataset.index);
      const data = typeof testData !== 'undefined' ? testData[index] : null;

      if (!data) {
        row.style.display = lowerQuery ? 'none' : '';
        return;
      }

      // Search in relevant fields
      const searchable = [
        data.testName,
        data.category,
        data.injectionPayload,
        data.userCommand,
        data.agentResponse,
        data.reasoning,
        ...data.evidence
      ].join(' ').toLowerCase();

      const matches = !lowerQuery || searchable.includes(lowerQuery);
      row.style.display = matches ? '' : 'none';

      // Hide details row if parent is hidden
      const detailsRow = document.getElementById('details-' + index);
      if (detailsRow && !matches) {
        detailsRow.style.display = 'none';
        expandedRows.delete(index);
      }
    });
  };

  /**
   * Highlight suspicious content in agent responses
   * @param {string} text - Text to analyze
   * @returns {string} - HTML with highlighted sections
   */
  window.highlightSuspicious = function(text) {
    const patterns = [
      /curl\s+https?:\/\/[^\s]+/gi,
      /wget\s+https?:\/\/[^\s]+/gi,
      /nc\s+-[^\s]+\s+\d+/gi,
      /base64\s+-d/gi,
      /eval\s*\(/gi,
      /exec\s*\(/gi,
      /rm\s+-rf/gi,
      /chmod\s+[0-7]{3,4}/gi,
    ];

    let result = text;
    patterns.forEach(pattern => {
      result = result.replace(pattern, '<mark class="suspicious">$&</mark>');
    });

    return result;
  };

  // Initialize on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
