import { Routes, Route } from 'react-router-dom';
import HomePage from '../pages/HomePage';
import GeneralServicesPage from '../pages/GeneralServicesPage';
import SpecializedServicesPage from '../pages/SpecializedServicesPage';
import BlogPage from '../pages/BlogPage';
import FurnitureCleaningPage from '../pages/FurnitureCleaningPage';
import TileCleaningPage from '../pages/TileCleaningPage';
import ResidentialPage from '../pages/ResidentialPage';
import CommercialPage from '../pages/CommercialPage';
import OfficesPage from '../pages/OfficesPage';
import CarpetCleaningPage from '../pages/CarpetCleaningPage';
import BlogPostDetailPage from '../pages/BlogPostDetailPage';
import AdminBlogsListPage from '../pages/AdminBlogsListPage';
import AdminBlogFormPage from '../pages/AdminBlogFormPage';
import AdminLoginPage from '../pages/AdminLoginPage';
import AdminDashboardPage from '../pages/AdminDashboardPage';
import AdminInvoicesPage from '../pages/AdminInvoicesPage';
import AdminPaymentsPage from '../pages/AdminPaymentsPage';
import RequireAdmin from '../components/admin/RequireAdmin';
import PrivacyPolicyPage from '../pages/PrivacyPolicyPage';
import ContactPage from '../pages/ContactPage';
import AvailablePage from '../pages/AvailablePage';
import AdminCalendarPage from '../pages/AdminCalendarPage';
import AdminClientsPage from '../pages/AdminClientPage';
import AdminStaffPage from '../pages/AdminStaffPage';
import AdminSettingsPage from '../pages/AdminSettingsPage';
import NotFoundPage from '../pages/NotFoundPage';

export default function AppRouter() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/available" element={<AvailablePage />} />
      <Route path="/privacy" element={<PrivacyPolicyPage />} />
      <Route path="/contact-us" element={<ContactPage />} />

      {/* General Services */}
      <Route path="/services/general" element={<GeneralServicesPage />} />
      <Route path="/services/general/residential" element={<ResidentialPage />} />
      <Route path="/services/general/commercial" element={<CommercialPage />} />
      <Route path="/services/general/offices" element={<OfficesPage />} />

      {/* Specialized Services */}
      <Route path="/services/specialized" element={<SpecializedServicesPage />} />
      <Route path="/services/specialized/furniture" element={<FurnitureCleaningPage />} />
      <Route path="/services/specialized/carpet" element={<CarpetCleaningPage />} />
      <Route path="/services/specialized/tile" element={<TileCleaningPage />} />

      <Route path="/blog" element={<BlogPage />} />
      <Route path="/blog/:slug" element={<BlogPostDetailPage />} />

      {/* Admin */}
      <Route path="/admin/login" element={<AdminLoginPage />} />
      <Route path="/admin/invoices" element={<AdminInvoicesPage />} />
      <Route path="/admin/payments" element={<AdminPaymentsPage />} />
      <Route path="/admin/calendar" element={<AdminCalendarPage />} />
      <Route path="/admin/clients" element={<AdminClientsPage />} />
      <Route path="/admin/staff" element={<AdminStaffPage />} />
      <Route path="/admin/settings" element={<AdminSettingsPage />} />
      <Route path="/admin" element={<AdminDashboardPage />} />

      <Route
        path="/admin/blogs"
        element={
          <RequireAdmin>
            <AdminBlogsListPage />
          </RequireAdmin>
        }
      />
      <Route
        path="/admin/blogs/new"
        element={
          <RequireAdmin>
            <AdminBlogFormPage />
          </RequireAdmin>
        }
      />
      <Route
        path="/admin/blogs/:id"
        element={
          <RequireAdmin>
            <AdminBlogFormPage />
          </RequireAdmin>
        }
      />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}