import { lazy, Suspense } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { ToastContainer } from './components/common/Toast'
import ErrorBoundary from './components/common/ErrorBoundary'
import RequireRole from './components/common/RequireRole'
import Spinner from './components/common/Spinner'
import { useAuth } from './contexts/AuthContext'
import useLocalNotifications from './hooks/useLocalNotifications'

// Liga as notificações locais (sem servidor) enquanto o app está aberto
function NotificationsBridge() {
  const { user } = useAuth()
  useLocalNotifications(user?.uid)
  return null
}

// Páginas com lazy-loading para code splitting
const SplashPage             = lazy(() => import('./pages/auth/SplashPage'))
const LoginPage              = lazy(() => import('./pages/auth/LoginPage'))
const RegisterPage           = lazy(() => import('./pages/auth/RegisterPage'))
const UserTypePage           = lazy(() => import('./pages/shared/UserTypePage'))
const ChatPage               = lazy(() => import('./pages/shared/ChatPage'))
const ChatsListPage          = lazy(() => import('./pages/shared/ChatsListPage'))
const ConfirmDataPage        = lazy(() => import('./pages/professional/ConfirmDataPage'))
const DashboardPage          = lazy(() => import('./pages/professional/DashboardPage'))
const PendingRequestsPage    = lazy(() => import('./pages/professional/PendingRequestsPage'))
const RequestDetailsPage     = lazy(() => import('./pages/professional/RequestDetailsPage'))
const EditProfilePage        = lazy(() => import('./pages/professional/EditProfilePage'))
const AgendaPage             = lazy(() => import('./pages/professional/AgendaPage'))
const ViewRatingsPage        = lazy(() => import('./pages/professional/ViewRatingsPage'))
const ReportsPage            = lazy(() => import('./pages/professional/ReportsPage'))
const ClientHomePage         = lazy(() => import('./pages/client/ClientHomePage'))
const ProfessionalDetailPage = lazy(() => import('./pages/client/ProfessionalDetailPage'))
const ClientRequestsPage     = lazy(() => import('./pages/client/ClientRequestsPage'))
const RateRequestPage        = lazy(() => import('./pages/client/RateRequestPage'))
const FavoritesPage          = lazy(() => import('./pages/client/FavoritesPage'))
const PetsPage               = lazy(() => import('./pages/client/PetsPage'))
const PlansPage              = lazy(() => import('./pages/professional/PlansPage'))
const AdminPage              = lazy(() => import('./pages/admin/AdminPage'))

function PageLoader() {
  return (
    <div className="flex items-center justify-center min-h-screen">
      <Spinner size={32} color="#375337" />
    </div>
  )
}

// Atalhos de guard: Auth = só login; Vet/Client = login + papel correto
const Auth   = ({ children }) => <RequireRole>{children}</RequireRole>
const Vet    = ({ children }) => <RequireRole role="professional">{children}</RequireRole>
const Client = ({ children }) => <RequireRole role="client">{children}</RequireRole>

export default function App() {
  return (
    <ErrorBoundary>
      <NotificationsBridge />
      <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route path="/" element={<SplashPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />

          {/* Compartilhadas (qualquer usuário autenticado) */}
          <Route path="/user-type" element={<Auth><UserTypePage /></Auth>} />
          <Route path="/confirm-data" element={<Auth><ConfirmDataPage /></Auth>} />
          <Route path="/edit-profile" element={<Auth><EditProfilePage /></Auth>} />
          <Route path="/chat/:requestId" element={<Auth><ChatPage /></Auth>} />
          <Route path="/chats" element={<Auth><ChatsListPage /></Auth>} />
          <Route path="/admin" element={<Auth><AdminPage /></Auth>} />
          <Route path="/request/:id" element={<Auth><RequestDetailsPage /></Auth>} />

          {/* Área do profissional */}
          <Route path="/dashboard" element={<Vet><DashboardPage /></Vet>} />
          <Route path="/pending-requests" element={<Vet><PendingRequestsPage /></Vet>} />
          <Route path="/agenda" element={<Vet><AgendaPage /></Vet>} />
          <Route path="/ratings" element={<Vet><ViewRatingsPage /></Vet>} />
          <Route path="/reports" element={<Vet><ReportsPage /></Vet>} />
          <Route path="/plans" element={<Vet><PlansPage /></Vet>} />

          {/* Área do cliente */}
          <Route path="/home" element={<Client><ClientHomePage /></Client>} />
          <Route path="/professional/:id" element={<Client><ProfessionalDetailPage /></Client>} />
          <Route path="/my-requests" element={<Client><ClientRequestsPage /></Client>} />
          <Route path="/favorites" element={<Client><FavoritesPage /></Client>} />
          <Route path="/pets" element={<Client><PetsPage /></Client>} />
          <Route path="/rate/:requestId" element={<Client><RateRequestPage /></Client>} />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
      <ToastContainer />
    </ErrorBoundary>
  )
}
