<script lang="ts">
  export let data: { disputes: Array<any>, state: string };
  let state = data.state || '';
</script>

<div class="max-w-6xl mx-auto px-4 py-8">
  <h1 class="text-xl font-semibold mb-4">Disputes</h1>
  <form class="mb-4 flex gap-2" method="get">
    <select class="input" name="state" bind:value={state}>
      <option value="">All</option>
      <option value="open">Open</option>
      <option value="needs_evidence">Needs Evidence</option>
      <option value="review">Review</option>
      <option value="resolved">Resolved</option>
    </select>
    <button class="btn btn-outline" type="submit">Filter</button>
  </form>

  <div class="space-y-4">
    {#each data.disputes as d}
      <div class="p-4 border rounded">
        <div class="flex items-center justify-between">
          <div>
            <div class="font-medium">Dispute {d.id.slice(0,8)} • {d.reason} • {d.state}</div>
            <div class="text-sm text-gray-600">Order: {d.orders?.id}</div>
          </div>
          <form method="post">
            <input type="hidden" name="id" value={d.id} />
            <div class="flex items-center gap-2">
              <select name="state" class="input">
                <option value="open" selected={d.state==='open'}>Open</option>
                <option value="needs_evidence" selected={d.state==='needs_evidence'}>Needs Evidence</option>
                <option value="review" selected={d.state==='review'}>Review</option>
                <option value="resolved" selected={d.state==='resolved'}>Resolved</option>
              </select>
              <input class="input" name="decision" placeholder="Decision (refund|partial|deny)" value={d.decision || ''} />
              <input class="input" name="refund_cents" type="number" placeholder="Refund cents" value={d.refund_cents || ''} />
              <button class="btn btn-outline" type="submit">Update</button>
            </div>
          </form>
        </div>
      </div>
    {/each}
  </div>
</div>


