<script lang="ts">
  export let data: { metrics: Array<any> };
</script>

<div class="max-w-6xl mx-auto px-4 py-8">
  <h1 class="text-xl font-semibold mb-4">Metrics</h1>
  <div class="overflow-x-auto">
    <table class="min-w-full text-sm">
      <thead>
        <tr class="text-left border-b">
          <th class="py-2 pr-4">Type</th>
          <th class="py-2 pr-4">Name</th>
          <th class="py-2 pr-4">Value</th>
          <th class="py-2 pr-4">Recorded</th>
        </tr>
      </thead>
      <tbody>
        {#each data.metrics as m}
          <tr class="border-b">
            <td class="py-2 pr-4">{m.metric_type}</td>
            <td class="py-2 pr-4">{m.metric_name}</td>
            <td class="py-2 pr-4">{m.value}</td>
            <td class="py-2 pr-4">{new Date(m.recorded_at).toLocaleString()}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
</div>


