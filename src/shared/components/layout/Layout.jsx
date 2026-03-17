import React from 'react';
import { Outlet } from 'react-router-dom';
import { Header, Footer } from '@/shared/components/layout/Header';
import './Layout.css';

export function Layout() {
  return (
    <div className="app-wrapper">
      <Header />
      <main className="main-content">
        <Outlet />
      </main>
      <Footer />
    </div>
  );
}
