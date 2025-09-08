<script lang="ts">
  import { page } from '$app/stores';
  import { onMount } from 'svelte';
  
  export let data;
  
  let currentTime = new Date();
  
  onMount(() => {
    const timer = setInterval(() => {
      currentTime = new Date();
    }, 1000);
    
    return () => clearInterval(timer);
  });
  
  $: currentPath = $page.url.pathname;
  $: isActive = (path: string) => currentPath === path;
</script>

<div class="min-h-screen bg-gray-50">
  <!-- Header -->
  <header class="bg-white shadow-sm border-b">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div class="flex justify-between items-center py-4">
        <div class="flex items-center space-x-4">
          <h1 class="text-2xl font-bold text-gray-900">Aussie Market Dashboard</h1>
          <div class="text-sm text-gray-500">
            Last updated: {currentTime.toLocaleTimeString()}
          </div>
        </div>
        <div class="flex items-center space-x-4">
          <div class="text-sm text-gray-600">
            Welcome, {data.user.email}
          </div>
          <a href="/admin" class="text-blue-600 hover:text-blue-800 text-sm font-medium">
            Back to Admin
          </a>
        </div>
      </div>
    </div>
  </header>

  <!-- Navigation -->
  <nav class="bg-white shadow-sm">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div class="flex space-x-8">
        <a 
          href="/dashboard" 
          class="py-4 px-1 border-b-2 font-medium text-sm transition-colors duration-200 {isActive('/dashboard') ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}"
        >
          Executive Overview
        </a>
        <a 
          href="/dashboard/operations" 
          class="py-4 px-1 border-b-2 font-medium text-sm transition-colors duration-200 {isActive('/dashboard/operations') ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}"
        >
          Operations
        </a>
        <a 
          href="/dashboard/business" 
          class="py-4 px-1 border-b-2 font-medium text-sm transition-colors duration-200 {isActive('/dashboard/business') ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}"
        >
          Business Intelligence
        </a>
        <a 
          href="/dashboard/technical" 
          class="py-4 px-1 border-b-2 font-medium text-sm transition-colors duration-200 {isActive('/dashboard/technical') ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}"
        >
          Technical
        </a>
      </div>
    </div>
  </nav>

  <!-- Main Content -->
  <main class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
    <slot />
  </main>
</div>

<style>
  /* Ensure proper focus management for accessibility */
  a:focus {
    @apply outline-none ring-2 ring-blue-500 ring-offset-2;
  }
</style>
