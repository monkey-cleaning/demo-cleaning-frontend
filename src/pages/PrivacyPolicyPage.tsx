import { Link } from 'react-router-dom';

export default function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto bg-white rounded-lg shadow-md p-6 sm:p-8">
        {/* Header */}
        <div className="mb-8">
          <Link to="/" className="text-blue-600 hover:text-blue-800 font-medium">
            ← Back to Home
          </Link>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mt-4">
            Privacy Policy
          </h1>
          <p className="text-gray-600 mt-2">Last Updated: {new Date().toLocaleDateString()}</p>
        </div>

        {/* Introduction */}
        <section className="mb-8">
          <p className="text-lg text-gray-700 leading-relaxed">
            Demo Cleaning Co. ("we," "our," "us") is committed to protecting your personal information. 
            This Privacy Policy explains how we collect, use, store, and protect data in compliance 
            with the Personal Information Protection Act (PIPA) of British Columbia.
          </p>
        </section>

        {/* Sections */}
        <div className="space-y-8">
          {/* Section 1 */}
          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-4">1. Information We Collect</h2>
            <h3 className="text-lg font-medium text-gray-800 mb-3">Information You Provide</h3>
            <p className="text-gray-700 mb-3">
              When you request a quote, book a cleaning, or contact us, we may collect:
            </p>
            <ul className="list-disc list-inside text-gray-700 space-y-2 ml-4">
              <li>Full name</li>
              <li>Email address</li>
              <li>Phone number</li>
              <li>Address of the service location</li>
              <li>Notes about your home or cleaning preferences</li>
              <li>Payment-related information</li>
            </ul>
          </section>

          {/* Section 2 */}
          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-4">2. How We Use Your Information</h2>
            <p className="text-gray-700 mb-3">
              We use your information to:
            </p>
            <ul className="list-disc list-inside text-gray-700 space-y-2 ml-4">
              <li>Provide cleaning services</li>
              <li>Communicate about appointments and scheduling</li>
              <li>Send invoices and receipts</li>
              <li>Improve customer service and operations</li>
              <li>Maintain internal business records</li>
              <li>Ensure safety and quality standards</li>
            </ul>
            <p className="text-gray-700 mt-3">
              We do not sell or trade your personal information to third parties.
            </p>
          </section>

          {/* Section 3 */}
          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-4">3. Sharing Personal Information</h2>
            <p className="text-gray-700 mb-3">
              We may share limited information with:
            </p>
            <ul className="list-disc list-inside text-gray-700 space-y-2 ml-4">
              <li>Service providers (email systems, scheduling tools, payment processors)</li>
              <li>Insurance or legal authorities if required by law</li>
              <li>Team members who require information to perform services</li>
            </ul>
            <p className="text-gray-700 mt-3">
              All partners are expected to meet Canadian privacy standards.
            </p>
          </section>

          {/* Section 4 */}
          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-4">4. Data Storage & Security</h2>
            <p className="text-gray-700 mb-3">
              We take reasonable steps to protect your data, including:
            </p>
            <ul className="list-disc list-inside text-gray-700 space-y-2 ml-4">
              <li>Encrypted communication</li>
              <li>Secure password-protected systems</li>
              <li>Restricted staff access</li>
              <li>Regular internal reviews</li>
            </ul>
            <p className="text-gray-700 mt-3">
              However, no online system is completely risk-free.
            </p>
          </section>

          {/* Section 5 */}
          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-4">5. Cookies & Tracking</h2>
            <p className="text-gray-700">
              Home - Demo Cleaning Co. uses cookies to enhance browsing and analyze website performance.
              You may disable cookies in your browser settings.
            </p>
          </section>

          {/* Section 6 */}
          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-4">6. Retention of Information</h2>
            <p className="text-gray-700 mb-3">
              We retain personal information only as long as necessary for:
            </p>
            <ul className="list-disc list-inside text-gray-700 space-y-2 ml-4">
              <li>Providing services</li>
              <li>Business and tax records</li>
              <li>Legal compliance (Canadian regulations)</li>
            </ul>
            <p className="text-gray-700 mt-3">
              You may request deletion once retention requirements are met.
            </p>
          </section>

          {/* Section 7 */}
          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-4">7. Your Rights</h2>
            <p className="text-gray-700 mb-3">
              Under PIPA, you may request to:
            </p>
            <ul className="list-disc list-inside text-gray-700 space-y-2 ml-4">
              <li>Access your personal information</li>
              <li>Correct inaccurate data</li>
              <li>Request deletion when applicable</li>
              <li>Withdraw consent for communication</li>
            </ul>
            <p className="text-gray-700 mt-4">
              To submit a request, email:
              <br />
              <span className="font-medium">📧 joaquin.labtinos@gmail.com</span>
            </p>
          </section>

          {/* Section 8 */}
          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-4">8. Children's Privacy</h2>
            <p className="text-gray-700">
              Our website and services are not directed to children under 13.
              We do not knowingly collect information from minors.
            </p>
          </section>

          {/* Section 9 */}
          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-4">9. External Links</h2>
            <p className="text-gray-700">
              We are not responsible for the privacy or content of third-party websites.
            </p>
          </section>

          {/* Section 10 */}
          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-4">10. Updates to This Policy</h2>
            <p className="text-gray-700">
              We may update this Privacy Policy periodically. All updates will be posted with the "Last Updated" date.
            </p>
          </section>
        </div>

        {/* Contact Info */}
        <div className="mt-8 p-4 bg-gray-50 rounded-lg">
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Contact Us</h3>
          <p className="text-gray-700">
            If you have any questions about this Privacy Policy, please contact us at:
            <br />
            <span className="font-medium">joaquin.labtinos@gmail.com</span>
          </p>
        </div>
      </div>
    </div>
  );
}