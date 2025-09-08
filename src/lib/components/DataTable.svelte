<script lang="ts">
  import { createEventDispatcher } from 'svelte';

  export let data: any[] = [];
  export let columns: Array<{
    key: string;
    label: string;
    sortable?: boolean;
    formatter?: (value: any) => string;
    width?: string;
  }> = [];
  export let loading: boolean = false;
  export let emptyMessage: string = 'No data available';
  export let striped: boolean = true;
  export let hoverable: boolean = true;
  export let compact: boolean = false;
  export let maxHeight: string = '400px';

  const dispatch = createEventDispatcher();

  let sortColumn: string | null = null;
  let sortDirection: 'asc' | 'desc' = 'asc';
  let sortedData = data;

  $: sortedData = sortData(data);

  function sortData(data: any[]) {
    if (!sortColumn) return data;
    
    return [...data].sort((a, b) => {
      const aVal = a[sortColumn!];
      const bVal = b[sortColumn!];
      
      if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });
  }

  function handleSort(column: string) {
    if (sortColumn === column) {
      sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
      sortColumn = column;
      sortDirection = 'asc';
    }
  }

  function formatValue(value: any, formatter?: (value: any) => string): string {
    if (formatter) return formatter(value);
    if (value === null || value === undefined) return '-';
    if (typeof value === 'number') {
      if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
      if (value >= 1000) return `${(value / 1000).toFixed(1)}K`;
      return value.toFixed(0);
    }
    return String(value);
  }

  function handleRowClick(row: any, index: number) {
    dispatch('rowClick', { row, index });
  }
</script>

<div class="data-table-container">
  {#if loading}
    <div class="table-loading">
      <div class="loading-spinner"></div>
      <span>Loading data...</span>
    </div>
  {:else if data.length === 0}
    <div class="table-empty">
      <div class="empty-icon">📊</div>
      <p>{emptyMessage}</p>
    </div>
  {:else}
    <div class="table-wrapper" style="max-height: {maxHeight};">
      <table class="data-table data-table-{compact ? 'compact' : 'normal'}">
        <thead>
          <tr>
            {#each columns as column}
              <th 
                class="table-header {column.sortable ? 'sortable' : ''}"
                style="width: {column.width || 'auto'};"
                on:click={() => column.sortable && handleSort(column.key)}
                role={column.sortable ? 'button' : undefined}
                tabindex={column.sortable ? 0 : undefined}
                on:keydown={(e) => column.sortable && e.key === 'Enter' && handleSort(column.key)}
              >
                <div class="header-content">
                  <span>{column.label}</span>
                  {#if column.sortable}
                    <span class="sort-indicator">
                      {#if sortColumn === column.key}
                        {sortDirection === 'asc' ? '↑' : '↓'}
                      {:else}
                        ↕
                      {/if}
                    </span>
                  {/if}
                </div>
              </th>
            {/each}
          </tr>
        </thead>
        <tbody>
          {#each sortedData as row, index}
            <tr 
              class="table-row {striped && index % 2 === 1 ? 'striped' : ''} {hoverable ? 'hoverable' : ''}"
              on:click={() => handleRowClick(row, index)}
              role="button"
              tabindex="0"
              on:keydown={(e) => e.key === 'Enter' && handleRowClick(row, index)}
            >
              {#each columns as column}
                <td class="table-cell">
                  {formatValue(row[column.key], column.formatter)}
                </td>
              {/each}
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
</div>

<style>
  .data-table-container {
    @apply bg-white rounded-lg border border-gray-200 overflow-hidden;
  }

  .table-loading {
    @apply flex items-center justify-center gap-3 py-8 text-gray-500;
  }

  .loading-spinner {
    @apply w-5 h-5 border-2 border-gray-200 border-t-blue-600 rounded-full animate-spin;
  }

  .table-empty {
    @apply flex flex-col items-center justify-center py-12 text-gray-500;
  }

  .empty-icon {
    @apply text-4xl mb-2;
  }

  .table-wrapper {
    @apply overflow-auto;
  }

  .data-table {
    @apply w-full border-collapse;
  }

  .data-table-compact {
    @apply text-sm;
  }

  .table-header {
    @apply bg-gray-50 border-b border-gray-200 px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider;
  }

  .table-header.sortable {
    @apply cursor-pointer hover:bg-gray-100 transition-colors duration-200;
  }

  .table-header.sortable:focus {
    @apply outline-none ring-2 ring-blue-500 ring-opacity-50;
  }

  .header-content {
    @apply flex items-center justify-between gap-2;
  }

  .sort-indicator {
    @apply text-gray-400 text-sm;
  }

  .table-row {
    @apply border-b border-gray-100 transition-colors duration-150;
  }

  .table-row.striped {
    @apply bg-gray-50;
  }

  .table-row.hoverable {
    @apply cursor-pointer hover:bg-blue-50;
  }

  .table-row:focus {
    @apply outline-none ring-2 ring-blue-500 ring-opacity-50;
  }

  .table-cell {
    @apply px-4 py-3 text-sm text-gray-900;
  }

  .data-table-compact .table-cell {
    @apply px-3 py-2;
  }

  /* Responsive adjustments */
  @media (max-width: 640px) {
    .table-header,
    .table-cell {
      @apply px-2 py-2 text-xs;
    }
    
    .header-content {
      @apply flex-col gap-1;
    }
  }
</style>
