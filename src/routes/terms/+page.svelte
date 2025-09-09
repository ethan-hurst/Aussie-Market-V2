<svelte:head>
	<title>Terms of Service - Aussie Market</title>
</svelte:head>

<main class="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
	<div class="prose prose-lg max-w-none">
		<h1>Terms of Service</h1>
		
		<p class="lead">
			Last updated: {new Date().toLocaleDateString('en-AU', { year: 'numeric', month: 'long', day: 'numeric' })}
		</p>

		<h2>1. Agreement to Terms</h2>
		<p>
			By accessing and using Aussie Market ("Service"), you agree to be bound by these Terms of Service 
			and all applicable laws and regulations. If you do not agree with any of these terms, you are 
			prohibited from using this service.
		</p>

		<h2>2. Use License</h2>
		<p>
			Permission is granted to temporarily use Aussie Market for personal, non-commercial transitory viewing only. 
			This is the grant of a license, not a transfer of title, and under this license you may not:
		</p>
		<ul>
			<li>modify or copy the materials</li>
			<li>use the materials for any commercial purpose or for any public display</li>
			<li>attempt to reverse engineer any software contained on the website</li>
			<li>remove any copyright or other proprietary notations from the materials</li>
		</ul>

		<h2>3. Marketplace Conduct</h2>
		<p>When using our marketplace, you agree to:</p>
		<ul>
			<li>Provide accurate and truthful listing descriptions</li>
			<li>Honor all successful auction commitments</li>
			<li>Complete payment within the specified timeframe</li>
			<li>Communicate respectfully with other users</li>
			<li>Not engage in fraudulent or deceptive practices</li>
		</ul>

		<h2>4. Payment and Fees</h2>
		<p>
			All transactions are processed securely through our payment partners. Sellers are responsible 
			for applicable marketplace fees. Buyers must complete payment to secure their winning bids.
		</p>

		<h2>5. Privacy Policy</h2>
		<p>
			Your privacy is important to us. Our Privacy Policy explains how we collect, use, and protect 
			your information when you use our Service.
		</p>

		<h2>6. Disclaimers</h2>
		<p>
			The materials on Aussie Market are provided on an 'as is' basis. Aussie Market makes no warranties, 
			expressed or implied, and hereby disclaims and negates all other warranties including without 
			limitation, implied warranties or conditions of merchantability, fitness for a particular purpose, 
			or non-infringement of intellectual property or other violation of rights.
		</p>

		<h2>7. Limitations</h2>
		<p>
			In no event shall Aussie Market or its suppliers be liable for any damages (including, without 
			limitation, damages for loss of data or profit, or due to business interruption) arising out of 
			the use or inability to use the materials on Aussie Market, even if Aussie Market or an authorized 
			representative has been notified orally or in writing of the possibility of such damage.
		</p>

		<h2>8. Governing Law</h2>
		<p>
			These terms and conditions are governed by and construed in accordance with the laws of Australia 
			and you irrevocably submit to the exclusive jurisdiction of the courts in that State or location.
		</p>

		<h2>9. Contact Information</h2>
		<p>
			If you have any questions about these Terms of Service, please contact us at:
			<br><strong>legal@aussiemarket.com.au</strong>
		</p>
	</div>
</main>

<style>
	.prose {
		@apply text-gray-800;
	}
	.prose h1 {
		@apply text-3xl font-bold text-gray-900 mb-6;
	}
	.prose h2 {
		@apply text-xl font-semibold text-gray-900 mt-8 mb-4;
	}
	.prose p {
		@apply mb-4 leading-relaxed;
	}
	.prose ul {
		@apply mb-4 ml-6;
	}
	.prose li {
		@apply mb-2;
	}
	.lead {
		@apply text-lg text-gray-600 mb-8;
	}
</style>