<script lang="ts">
  export let data: { users: Array<any>, q: string };
  let q = data.q || '';
</script>

<div class="max-w-6xl mx-auto px-4 py-8">
  <h1 class="text-xl font-semibold mb-4">Users</h1>
  <form class="mb-4 flex gap-2" method="get">
    <input class="input flex-1" name="q" bind:value={q} placeholder="Search email" />
    <button class="btn btn-outline" type="submit">Search</button>
  </form>
  <div class="overflow-x-auto">
    <table class="min-w-full text-sm">
      <thead>
        <tr class="text-left border-b">
          <th class="py-2 pr-4">ID</th>
          <th class="py-2 pr-4">Name</th>
          <th class="py-2 pr-4">Email</th>
          <th class="py-2 pr-4">Role</th>
          <th class="py-2 pr-4">KYC</th>
        </tr>
      </thead>
      <tbody>
        {#each data.users as u}
          <tr class="border-b hover:bg-gray-50">
            <td class="py-2 pr-4 font-mono">{u.id.slice(0,8)}</td>
            <td class="py-2 pr-4">{u.legal_name}</td>
            <td class="py-2 pr-4">{u.email}</td>
            <td class="py-2 pr-4">{u.role}</td>
            <td class="py-2 pr-4">{u.kyc} {u.kyc_completed_at ? `(at ${new Date(u.kyc_completed_at).toLocaleDateString()})` : ''}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
</div>


