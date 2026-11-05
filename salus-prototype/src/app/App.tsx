import { BrowserRouter } from 'react-router-dom';

import { FilterProvider } from './layout/filters';
import { AppRoutes } from './routes';
import './app.css';

export default function App() {
  return (
    <BrowserRouter>
      <FilterProvider>
        <AppRoutes />
      </FilterProvider>
    </BrowserRouter>
  );
}
