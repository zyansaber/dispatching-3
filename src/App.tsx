import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Index from './pages/Index';
import DispatchPage from './pages/DispatchPage';
import ReallocationPage from './pages/ReallocationPage';
import StockPage from './pages/StockPage';
import AdminPage from './pages/AdminPage';
import PrintDocPage from './pages/PrintDocPage';
import TransportDamageRecordPage from './pages/TransportDamageRecordPage';
import NotFound from './pages/NotFound';

const App = () => (
  <TooltipProvider>
    <Toaster />
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Index />}>
          <Route index element={<Navigate to="/stock" replace />} />
          <Route path="stock" element={<StockPage />} />
          <Route path="dispatch" element={<DispatchPage />} />
          <Route path="print-doc" element={<PrintDocPage />} />
          <Route path="transport-damage" element={<TransportDamageRecordPage />} />
          <Route path="reallocation" element={<ReallocationPage />} />
          <Route path="admin" element={<AdminPage />} />
        </Route>
        <Route path="*" element={<NotFound />} />
      </Routes>
    </BrowserRouter>
  </TooltipProvider>
);

export default App;
