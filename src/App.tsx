import AppRouter from './router/AppRouter';
import { SiteConfigProvider } from './context/SiteConfigContext';

function App() {
  return (
    <SiteConfigProvider>
      <AppRouter />
    </SiteConfigProvider>
  );
}

export default App;
