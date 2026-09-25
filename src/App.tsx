import AppRouter from './router/AppRouter';
import { SiteConfigProvider } from './context/SiteConfigContext';
import { SiteImagesProvider } from './context/SiteImagesContext';

function App() {
  return (
    <SiteConfigProvider>
      <SiteImagesProvider>
        <AppRouter />
      </SiteImagesProvider>
    </SiteConfigProvider>
  );
}

export default App;
