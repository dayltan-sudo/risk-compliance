import { useEffect } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';

import { Sidebar, Tag, TopBar, cn } from '../ui';
import type { SidebarItem, SidebarSection } from '../ui';
import { formatDate } from '../components/format';
import { FilterBar } from './FilterBar';
import { RailPanel } from './RailPanel';
import { useFilteredPortfolio } from './filters';

function OverviewIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round">
      <rect x="3.5" y="3.5" width="7" height="7" rx="1.2" />
      <rect x="13.5" y="3.5" width="7" height="7" rx="1.2" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="1.2" />
      <rect x="13.5" y="13.5" width="7" height="7" rx="1.2" />
    </svg>
  );
}

function MapIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round">
      <circle cx="12" cy="12" r="8.5" />
      <path d="M3.5 12h17" />
      <path d="M12 3.5c2.4 2.4 3.6 5.3 3.6 8.5S14.4 18.1 12 20.5c-2.4-2.4-3.6-5.3-3.6-8.5S9.6 5.9 12 3.5z" />
    </svg>
  );
}

function UserBlock() {
  return (
    <div className="sal-user">
      <span className="sal-user__avatar" aria-hidden="true">
        GR
      </span>
      <span className="sal-user__body">
        <span className="sal-user__name">Group Risk</span>
        <span className="sal-user__role">Demo workspace</span>
      </span>
    </div>
  );
}

export function AppShell() {
  const { summary, portfolio } = useFilteredPortfolio();
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [location.pathname]);

  const PAGES: Record<string, { name: string; id: string }> = {
    '/': { name: 'Group overview', id: 'overview' },
    '/map': { name: 'Global map', id: 'map' },
    '/coverage': { name: 'Coverage adequacy', id: 'coverage' },
    '/hotspots': { name: 'Risk hotspots', id: 'hotspots' },
    '/contracts': { name: 'Contract requirements', id: 'contracts' },
    '/exclusions': { name: 'Insurance exclusions', id: 'exclusions' },
    '/audit': { name: 'Audit trail', id: 'audit' },
    '/documents': { name: 'Document inbox', id: 'documents' },
  };
  const page = PAGES[location.pathname] ?? { name: 'Group overview', id: 'overview' };
  const pageName = page.name;
  const activeId = page.id;
  const criticalHotspots = summary.hotspots.filter((hotspot) => hotspot.band === 'Critical').length;
  const highHotspots = summary.hotspots.filter((hotspot) => hotspot.band === 'High').length;

  const sections: SidebarSection[] = [
    {
      id: 'monitor',
      label: 'Monitor',
      items: [
        {
          id: 'overview',
          label: 'Group overview',
          icon: <OverviewIcon />,
          count: summary.openGaps > 0 ? summary.openGaps : undefined,
          badgeTone: 'risk',
        },
        {
          id: 'map',
          label: 'Global map',
          icon: <MapIcon />,
          count: criticalHotspots + highHotspots > 0 ? criticalHotspots + highHotspots : undefined,
          badgeTone: 'risk',
        },
        { id: 'coverage', label: 'Coverage' },
        { id: 'hotspots', label: 'Hotspots' },
        { id: 'contracts', label: 'Contracts' },
        { id: 'exclusions', label: 'Exclusions' },
      ],
    },
    {
      id: 'ingest',
      label: 'Ingest',
      items: [{ id: 'documents', label: 'Document inbox' }],
    },
    {
      id: 'govern',
      label: 'Govern',
      items: [{ id: 'audit', label: 'Audit trail' }],
    },
  ];

  const onNavigate = (item: SidebarItem) => {
    const target = Object.entries(PAGES).find(([, value]) => value.id === item.id)?.[0];
    if (target) navigate(target);
  };

  return (
    <div className="sal-app">
      <Sidebar
        className="sal-sidebar--salus"
        brand={{ title: 'Salus', subtitle: 'Group insurance' }}
        sections={sections}
        activeId={activeId}
        onNavigate={onNavigate}
        footer={<UserBlock />}
      />

      <div className="sal-app__main">
        <TopBar
          breadcrumb={[
            { label: 'Group portfolio', onClick: () => navigate('/') },
            { label: pageName },
          ]}
          filters={
            <>
              <Tag tone="neutral">Synthetic data</Tag>
              <span className="sal-asof">As of {formatDate(portfolio.config.effectiveFrom)}</span>
            </>
          }
          actions={
            <nav className="sal-topnav" aria-label="Pages">
              <NavLink to="/" end className={({ isActive }) => cn('sal-topnav__link', isActive && 'is-active')}>
                Overview
              </NavLink>
              <NavLink to="/map" className={({ isActive }) => cn('sal-topnav__link', isActive && 'is-active')}>
                Map
              </NavLink>
              <NavLink to="/coverage" className={({ isActive }) => cn('sal-topnav__link', isActive && 'is-active')}>
                Coverage
              </NavLink>
              <NavLink to="/contracts" className={({ isActive }) => cn('sal-topnav__link', isActive && 'is-active')}>
                Contracts
              </NavLink>
              <NavLink to="/exclusions" className={({ isActive }) => cn('sal-topnav__link', isActive && 'is-active')}>
                Exclusions
              </NavLink>
            </nav>
          }
        />

        <FilterBar />

        <div className="sal-app__body">
          <main className="sal-app__content" id="main">
            <Outlet />
          </main>
          <aside className="sal-app__rail" aria-label="Actions and assistant">
            <RailPanel />
          </aside>
        </div>
      </div>
    </div>
  );
}
