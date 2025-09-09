<svelte:head>
	<title>Privacy Policy - Aussie Market</title>
</svelte:head>

<main class="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
	<div class="prose prose-lg max-w-none">
		<h1>Privacy Policy</h1>
		
		<p class="lead">
			Last updated: {new Date().toLocaleDateString('en-AU', { year: 'numeric', month: 'long', day: 'numeric' })}
		</p>

		<h2>1. Information We Collect</h2>
		<p>
			We collect information you provide directly to us, such as when you create an account, 
			make a purchase, or contact us for support.
		</p>

		<h3>Personal Information</h3>
		<ul>
			<li>Name and contact information</li>
			<li>Email address and phone number</li>
			<li>Payment and billing information</li>
			<li>Identity verification documents (for KYC compliance)</li>
			<li>Shipping addresses</li>
		</ul>

		<h3>Usage Information</h3>
		<ul>
			<li>Browsing history and search queries</li>
			<li>Device information and IP address</li>
			<li>Cookies and similar tracking technologies</li>
			<li>Transaction history and bidding activity</li>
		</ul>

		<h2>2. How We Use Your Information</h2>
		<p>We use the information we collect to:</p>
		<ul>
			<li>Provide and maintain our marketplace services</li>
			<li>Process transactions and payments</li>
			<li>Verify user identity and prevent fraud</li>
			<li>Send important notifications about your account</li>
			<li>Improve our services and user experience</li>
			<li>Comply with legal obligations</li>
		</ul>

		<h2>3. Information Sharing</h2>
		<p>
			We do not sell, trade, or otherwise transfer your personal information to outside parties 
			except as described below:
		</p>
		<ul>
			<li><strong>Service Providers:</strong> Third-party services that help us operate our platform</li>
			<li><strong>Payment Processors:</strong> Secure payment processing partners</li>
			<li><strong>Legal Requirements:</strong> When required by law or to protect our rights</li>
			<li><strong>Business Transfers:</strong> In connection with a merger or acquisition</li>
		</ul>

		<h2>4. Data Security</h2>
		<p>
			We implement appropriate security measures to protect your personal information against 
			unauthorized access, alteration, disclosure, or destruction. This includes:
		</p>
		<ul>
			<li>Encryption of sensitive data in transit and at rest</li>
			<li>Regular security assessments and updates</li>
			<li>Access controls and authentication requirements</li>
			<li>Secure payment processing through certified partners</li>
		</ul>

		<h2>5. Your Rights</h2>
		<p>Under Australian Privacy Law, you have the right to:</p>
		<ul>
			<li>Access your personal information</li>
			<li>Correct inaccurate information</li>
			<li>Request deletion of your data</li>
			<li>Object to processing of your information</li>
			<li>Data portability</li>
		</ul>

		<h2>6. Cookies and Tracking</h2>
		<p>
			We use cookies and similar technologies to enhance your experience, analyze usage, 
			and provide personalized content. You can control cookie preferences through your 
			browser settings.
		</p>

		<h2>7. International Transfers</h2>
		<p>
			Your information may be transferred to and processed in countries other than Australia. 
			We ensure appropriate safeguards are in place to protect your privacy rights.
		</p>

		<h2>8. Children's Privacy</h2>
		<p>
			Our Service is not intended for children under 18 years of age. We do not knowingly 
			collect personal information from children under 18.
		</p>

		<h2>9. Changes to This Policy</h2>
		<p>
			We may update this Privacy Policy from time to time. We will notify you of any 
			significant changes by posting the new policy on this page and updating the 
			"Last updated" date.
		</p>

		<h2>10. Contact Us</h2>
		<p>
			If you have any questions about this Privacy Policy or our data practices, 
			please contact us at:
		</p>
		<div class="bg-gray-50 p-4 rounded-lg mt-4">
			<p class="mb-2"><strong>Email:</strong> privacy@aussiemarket.com.au</p>
			<p class="mb-2"><strong>Privacy Officer:</strong> Aussie Market Privacy Team</p>
			<p><strong>Address:</strong> [Your Business Address]</p>
		</div>
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
	.prose h3 {
		@apply text-lg font-medium text-gray-900 mt-6 mb-3;
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