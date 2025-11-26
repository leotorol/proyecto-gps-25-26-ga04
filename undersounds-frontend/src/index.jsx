import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import ConcertProvider from './context/ConcertContext';

ReactDOM.createRoot(document.getElementById('root')).render(
    <ConcertProvider>
      <App />
    </ConcertProvider>
);