import { createBrowserRouter, Navigate, useSearchParams } from 'react-router-dom';
import { Layout } from '../components/Layout';
import { App } from './App';
import { LandingPage } from '../components/landing/LandingPage';
import { SignInPage } from '../components/auth/SignInPage';
import { CreateAccountPage } from '../components/auth/CreateAccountPage';
import { OrganizationSetupPage } from '../components/auth/OrganizationSetupPage';
import { ExecutiveDashboard } from '../components/ExecutiveDashboard';
import { TransactionsPage } from '../components/TransactionsPage';
import { AccountsPage } from '../components/AccountsPage';
import { ImportsPage } from '../components/ImportsPage';
import { ReconciliationPage } from '../components/ReconciliationPage';
import { ReconciliationRunDetailsPage } from '../components/ReconciliationRunDetailsPage';
import { FindingsDashboard } from '../components/FindingsDashboard';
import { FindingDetailsPage } from '../components/FindingDetailsPage';
import { CashFlowDashboard } from '../components/CashFlowDashboard';
import { ActionCenterDashboard } from '../components/ActionCenterDashboard';
import { ActionDetailsPage } from '../components/ActionDetailsPage';

/**
 * Gateway for the protected /app workspace entry point.
 * By default, loads the business-owner Executive Overview dashboard.
 * When an explicit workspace tab is provided (?tab=telemetry, ?tab=ingestion),
 * renders the corresponding workspace tab.
 */
export const AppRouteEntry: React.FC = () => {
  const [searchParams] = useSearchParams();
  const tab = searchParams.get('tab');

  if (tab) {
    return (
      <Layout>
        <App />
      </Layout>
    );
  }

  return <ExecutiveDashboard />;
};

export const router = createBrowserRouter([
  {
    path: '/',
    element: <LandingPage />,
  },
  {
    path: '/dashboard',
    element: <ExecutiveDashboard />,
  },
  {
    path: '/app',
    element: <AppRouteEntry />,
  },
  {
    path: '/diagnostics',
    element: (
      <Layout>
        <App initialTab="telemetry" />
      </Layout>
    ),
  },
  {
    path: '/system-diagnostics',
    element: (
      <Layout>
        <App initialTab="telemetry" />
      </Layout>
    ),
  },
  {
    path: '/transactions',
    element: <TransactionsPage />,
  },
  {
    path: '/ledger',
    element: <TransactionsPage />,
  },
  {
    path: '/accounts',
    element: <AccountsPage />,
  },
  {
    path: '/financial-accounts',
    element: <AccountsPage />,
  },
  {
    path: '/imports',
    element: <ImportsPage />,
  },
  {
    path: '/import-history',
    element: <ImportsPage />,
  },
  {
    path: '/reconciliation',
    element: <ReconciliationPage />,
  },
  {
    path: '/reconciliation-workspace',
    element: <ReconciliationPage />,
  },
  {
    path: '/reconciliation/runs/:runId',
    element: <ReconciliationRunDetailsPage />,
  },
  {
    path: '/reconciliation/runs',
    element: <ReconciliationRunDetailsPage />,
  },
  {
    path: '/reconciliation-run-details/:runId',
    element: <ReconciliationRunDetailsPage />,
  },
  {
    path: '/findings',
    element: <FindingsDashboard />,
  },
  {
    path: '/financial-findings',
    element: <FindingsDashboard />,
  },
  {
    path: '/leakage-findings',
    element: <FindingsDashboard />,
  },
  {
    path: '/findings/:findingId',
    element: <FindingDetailsPage />,
  },
  {
    path: '/findings/details/:findingId',
    element: <FindingDetailsPage />,
  },
  {
    path: '/finding-details/:findingId',
    element: <FindingDetailsPage />,
  },
  {
    path: '/cash-flow',
    element: <CashFlowDashboard />,
  },
  {
    path: '/cash-flow-forecast',
    element: <CashFlowDashboard />,
  },
  {
    path: '/forecast',
    element: <CashFlowDashboard />,
  },
  {
    path: '/scenarios',
    element: <CashFlowDashboard />,
  },
  {
    path: '/actions',
    element: <ActionCenterDashboard />,
  },
  {
    path: '/action-center',
    element: <ActionCenterDashboard />,
  },
  {
    path: '/business-actions',
    element: <ActionCenterDashboard />,
  },
  {
    path: '/actions/:actionId',
    element: <ActionDetailsPage />,
  },
  {
    path: '/action-center/:actionId',
    element: <ActionDetailsPage />,
  },
  {
    path: '/actions/details/:actionId',
    element: <ActionDetailsPage />,
  },
  {
    path: '/action-details/:actionId',
    element: <ActionDetailsPage />,
  },
  {
    path: '/signin',
    element: <SignInPage />,
  },
  {
    path: '/login',
    element: <SignInPage />,
  },
  {
    path: '/signup',
    element: <CreateAccountPage />,
  },
  {
    path: '/create-account',
    element: <CreateAccountPage />,
  },
  {
    path: '/setup',
    element: <OrganizationSetupPage />,
  },
  {
    path: '/onboarding',
    element: <OrganizationSetupPage />,
  },
  {
    path: '*',
    element: <Navigate to="/" replace />,
  },
]);
