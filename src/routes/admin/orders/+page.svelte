<script lang="ts">
  export let data: { orders: Array<any> };
</script>

<div class="max-w-6xl mx-auto px-4 py-8">
  <h1 class="text-xl font-semibold mb-4">Recent Orders</h1>
  <div class="overflow-x-auto">
    <table class="min-w-full text-sm">
      <thead>
        <tr class="text-left border-b">
          <th class="py-2 pr-4">ID</th>
          <th class="py-2 pr-4">Buyer</th>
          <th class="py-2 pr-4">Seller</th>
          <th class="py-2 pr-4">Amount</th>
          <th class="py-2 pr-4">State</th>
          <th class="py-2 pr-4">Created</th>
        </tr>
      </thead>
      <tbody>
        {#each data.orders as o}
          <tr class="border-b hover:bg-gray-50">
            <td class="py-2 pr-4 font-mono">{o.id.slice(0,8)}</td>
            <td class="py-2 pr-4">{o.buyer?.legal_name} ({o.buyer?.email})</td>
            <td class="py-2 pr-4">{o.seller?.legal_name} ({o.seller?.email})</td>
            <td class="py-2 pr-4">${(o.amount_cents/100).toFixed(2)}</td>
            <td class="py-2 pr-4">{o.state}</td>
            <td class="py-2 pr-4">{new Date(o.created_at).toLocaleString()}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
</div>


