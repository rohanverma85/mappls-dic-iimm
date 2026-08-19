import type { Session } from '../../shared/types';
import type { AppPage } from '../components/Shell';
import Dashboard from './Dashboard';
import { ActivityPage, NotificationsPage, ReportsPage, SearchPage, SyncPage } from './Governance';
import { AssetsPage, OnboardingPage, ProjectsPage, TenantsPage, UsersPage } from './Operations';
import { AttendancePage, CitizenPage, DefectsPage, HelpdeskPage, InspectionsPage, PaymentsPage } from './Workflows';
import GisPage from './Gis';

export default function Workspace({session,page,navigate}:{session:Session;page:AppPage;navigate:(p:AppPage)=>void}) {
  switch(page){
    case 'dashboard':return <Dashboard session={session} navigate={navigate}/>;
    case 'tenants':return <TenantsPage/>;
    case 'onboarding':return <OnboardingPage/>;
    case 'users':return <UsersPage session={session}/>;
    case 'projects':return <ProjectsPage session={session}/>;
    case 'assets':return <AssetsPage session={session}/>;
    case 'gis':return <GisPage/>;
    case 'attendance':return <AttendancePage session={session}/>;
    case 'inspections':return <InspectionsPage session={session}/>;
    case 'defects':return <DefectsPage session={session}/>;
    case 'payments':return <PaymentsPage session={session}/>;
    case 'citizen':return <CitizenPage session={session}/>;
    case 'helpdesk':return <HelpdeskPage session={session}/>;
    case 'reports':return <ReportsPage/>;
    case 'notifications':return <NotificationsPage navigate={navigate}/>;
    case 'activity':return <ActivityPage session={session}/>;
    case 'search':return <SearchPage navigate={navigate}/>;
    case 'sync':return <SyncPage session={session}/>;
  }
}
