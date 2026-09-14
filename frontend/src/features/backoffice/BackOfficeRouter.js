import React from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import AdminDashboard from '../admin/pages/AdminDashboardPage';
import AdminCreateBookingPage from '../admin/pages/AdminCreateBookingPage';
import AdminVouchersPage from '../admin/pages/AdminVouchersPage';
import BaggageAdminPage from '../admin/pages/BaggageAdminPage';
import FlexAdminPage from '../admin/pages/FlexAdminPage';
import { BackOfficeAuthProvider, useBackOfficeAuth } from './BackOfficeAuthContext';
import BackOfficeShell from './BackOfficeShell';
import {
  AuditLogsPage, CarsPage, CommissionsPage, DisputesPage, FinancePage, HotelsPage,
  IntegrationsPage, LeadDetailPage, LeadsPage, PaymentsPage, PlaceholderPage,
  ProductBookingDetailPage, RefundsPage, ReportsPage, RolesPage, SecurityPage,
  SettingsPage, SupplierPaymentsPage, SuppliersPage, TasksPage, TeamPage, TeamsPage,
  TripDetailPage, TripsPage
} from './BackOfficeDataPages';
import { PaymentAuthorizationDetailPage, PaymentAuthorizationsPage } from './SecurePaymentAdminPages';
import PaymentFlowTestPage from './PaymentFlowTestPage';
import {
  AdminHomePage, CustomerDetailPage, CustomersHubPage, LegacyRedirect, NewBookingPage,
  PaymentsNav, SettingsBack, SettingsHomePage, UnifiedBookingsPage
} from './AdminOperationsPages';
import './SecurePaymentAdmin.css';
import './AdminCreateBookingPolish.css';

function LoginHandoff() {
  React.useEffect(() => { window.location.replace('/admin/login'); }, []);
  return <div className="bo-card">Opening admin login…</div>;
}

function Guard({ permission, permissions, children }) {
  const { loading, profile, hasPermission } = useBackOfficeAuth();
  if (loading) return <div className="bo-card">Loading FareTransit Admin…</div>;
  if (!profile) return <LoginHandoff />;
  const required = permissions || (permission ? [permission] : []);
  if (required.length && !required.some(hasPermission)) {
    return <div className="bo-card"><h2>Access denied</h2><p>You do not have permission to open this area.</p></div>;
  }
  return children;
}

function Page({ permission, permissions, children }) {
  return <Guard permission={permission} permissions={permissions}><BackOfficeShell>{children}</BackOfficeShell></Guard>;
}

const BOOKING_VIEW = ['bookings.flights.view','bookings.hotels.view','bookings.cars.view'];
const PAYMENT_VIEW = ['payments.view','authorization.view'];
const SETTINGS_VIEW = ['admin.settings','team.view','admin.integrations','admin.audit_logs'];

export default function BackOfficeRouter() {
  return <BackOfficeAuthProvider><Routes>
    {/* Five primary admin destinations */}
    <Route path="/admin" element={<Page permission="dashboard.view"><AdminHomePage /></Page>} />
    <Route path="/admin/bookings" element={<Page permissions={BOOKING_VIEW}><UnifiedBookingsPage /></Page>} />
    <Route path="/admin/bookings/new" element={<Page permissions={['bookings.flights.create','bookings.hotels.create','bookings.cars.create']}><NewBookingPage /></Page>} />
    <Route path="/admin/customers" element={<Page permission="crm.customers.view"><CustomersHubPage /></Page>} />
    <Route path="/admin/customers/:id" element={<Page permission="crm.customers.view"><CustomerDetailPage /></Page>} />
    <Route path="/admin/payments" element={<Page permissions={PAYMENT_VIEW}><PaymentsNav active="transactions"><PaymentsPage /></PaymentsNav></Page>} />
    <Route path="/admin/settings" element={<Page permissions={SETTINGS_VIEW}><SettingsHomePage /></Page>} />

    {/* Booking creation and detail workspaces — not permanent navigation items */}
    <Route path="/admin/bookings/new/flight" element={<Page permission="bookings.flights.create"><AdminCreateBookingPage /></Page>} />
    <Route path="/admin/bookings/new/hotel" element={<Page permission="bookings.hotels.create"><HotelsPage /></Page>} />
    <Route path="/admin/bookings/new/car" element={<Page permission="bookings.cars.create"><CarsPage /></Page>} />
    <Route path="/admin/bookings/flights/:code" element={<Page permission="bookings.flights.view"><AdminDashboard /></Page>} />
    <Route path="/admin/bookings/hotels/:id" element={<Page permission="bookings.hotels.view"><ProductBookingDetailPage type="hotel" /></Page>} />
    <Route path="/admin/bookings/cars/:id" element={<Page permission="bookings.cars.view"><ProductBookingDetailPage type="car" /></Page>} />
    <Route path="/admin/bookings/:code" element={<Page permission="bookings.flights.view"><AdminDashboard /></Page>} />

    {/* Payments — grouped beneath one primary area */}
    <Route path="/admin/payments/authorizations" element={<Page permissions={PAYMENT_VIEW}><PaymentsNav active="authorizations"><PaymentAuthorizationsPage /></PaymentsNav></Page>} />
    <Route path="/admin/payments/authorizations/:id" element={<Page permission="authorization.view"><PaymentAuthorizationDetailPage /></Page>} />
    <Route path="/admin/payments/refunds" element={<Page permission="payments.view"><PaymentsNav active="refunds"><RefundsPage /></PaymentsNav></Page>} />
    <Route path="/admin/payments/disputes" element={<Page permission="payments.view"><DisputesPage /></Page>} />

    {/* Settings — configuration is intentionally removed from daily navigation */}
    <Route path="/admin/settings/business" element={<Page permission="admin.settings"><SettingsBack title="Business"><SettingsPage /></SettingsBack></Page>} />
    <Route path="/admin/settings/users" element={<Page permission="team.view"><SettingsBack title="Users & Permissions"><TeamPage /></SettingsBack></Page>} />
    <Route path="/admin/settings/email" element={<Page permission="admin.settings"><SettingsBack title="Email"><PlaceholderPage title="Email Templates" description="Manage customer communication templates without mixing them into booking operations." /></SettingsBack></Page>} />
    <Route path="/admin/settings/integrations" element={<Page permission="admin.integrations"><SettingsBack title="Integrations"><IntegrationsPage /></SettingsBack></Page>} />
    <Route path="/admin/settings/security" element={<Page permission="admin.settings"><SettingsBack title="Security"><SecurityPage /></SettingsBack></Page>} />
    <Route path="/admin/settings/audit" element={<Page permission="admin.audit_logs"><SettingsBack title="Audit Log"><AuditLogsPage /></SettingsBack></Page>} />

    {/* Useful specialist tools remain available by direct URL, but never clutter the main sidebar */}
    <Route path="/admin/crm/leads" element={<Page permission="crm.leads.view"><LeadsPage /></Page>} />
    <Route path="/admin/crm/leads/:id" element={<Page permission="crm.leads.view"><LeadDetailPage /></Page>} />
    <Route path="/admin/crm/tasks" element={<Page permission="crm.tasks.view"><TasksPage /></Page>} />
    <Route path="/admin/trips" element={<Page permission="trips.view"><TripsPage /></Page>} />
    <Route path="/admin/trips/:id" element={<Page permission="trips.view"><TripDetailPage /></Page>} />
    <Route path="/admin/finance" element={<Page permission="finance.view"><FinancePage /></Page>} />
    <Route path="/admin/finance/commissions" element={<Page permission="finance.commissions"><CommissionsPage /></Page>} />
    <Route path="/admin/finance/supplier-payments" element={<Page permission="finance.view"><SupplierPaymentsPage /></Page>} />
    <Route path="/admin/suppliers" element={<Page permission="suppliers.view"><SuppliersPage /></Page>} />
    <Route path="/admin/reports" element={<Page permission="reports.view"><ReportsPage /></Page>} />
    <Route path="/admin/team/roles" element={<Page permission="team.view"><RolesPage /></Page>} />
    <Route path="/admin/team/teams" element={<Page permission="team.view"><TeamsPage /></Page>} />
    <Route path="/admin/testing/payment-flow" element={<Page permission="admin.settings"><PaymentFlowTestPage /></Page>} />
    <Route path="/admin/vouchers" element={<Page permission="admin.settings"><AdminVouchersPage /></Page>} />
    <Route path="/admin/baggage" element={<Page permissions={BOOKING_VIEW}><BaggageAdminPage /></Page>} />
    <Route path="/admin/flex" element={<Page permissions={BOOKING_VIEW}><FlexAdminPage /></Page>} />

    {/* Legacy URLs now resolve into the simplified information architecture */}
    <Route path="/admin/backoffice" element={<Navigate to="/admin" replace />} />
    <Route path="/admin/dashboard" element={<Navigate to="/admin/bookings?type=flight" replace />} />
    <Route path="/admin/bookings/flights" element={<Navigate to="/admin/bookings?type=flight" replace />} />
    <Route path="/admin/bookings/hotels" element={<Navigate to="/admin/bookings?type=hotel" replace />} />
    <Route path="/admin/bookings/cars" element={<Navigate to="/admin/bookings?type=car" replace />} />
    <Route path="/admin/crm" element={<Navigate to="/admin/customers" replace />} />
    <Route path="/admin/crm/customers" element={<Navigate to="/admin/customers" replace />} />
    <Route path="/admin/crm/customers/:id" element={<LegacyRedirect to="/admin/customers/:id" />} />
    <Route path="/admin/team" element={<Navigate to="/admin/settings/users" replace />} />
    <Route path="/admin/team/users" element={<Navigate to="/admin/settings/users" replace />} />
    <Route path="/admin/settings/audit-logs" element={<Navigate to="/admin/settings/audit" replace />} />
    <Route path="*" element={<Navigate to="/admin" replace />} />
  </Routes></BackOfficeAuthProvider>;
}
