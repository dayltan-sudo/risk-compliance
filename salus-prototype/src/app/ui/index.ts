/// <reference types="vite/client" />
/**
 * Salus UI shell primitives.
 *
 * Presentational only: no data fetching, no store, no router, nothing from
 * `src/engine`. Every component is a named export with typed props; there are
 * no default exports.
 *
 * Importing this barrel also pulls in `theme.css`, which defines the design
 * tokens and every `.sal-*` class these components rely on. Import the barrel
 * once from the app shell and the styling comes with it.
 */
import './theme.css';

export { Sidebar } from './Sidebar';
export type {
  SidebarBadgeTone,
  SidebarBrand,
  SidebarItem,
  SidebarProps,
  SidebarSection,
} from './Sidebar';

export { TopBar } from './TopBar';
export type {
  BreadcrumbItem,
  ScopeControl,
  ScopeOption,
  TopBarProps,
} from './TopBar';

export { Card } from './Card';
export type { CardProps } from './Card';

export { Tag } from './Tag';
export type { TagProps, TagTone } from './Tag';

export { KpiTile } from './KpiTile';
export type { DeltaDirection, DeltaIntent, KpiDelta, KpiTileProps, KpiTone } from './KpiTile';

export { DataTable } from './DataTable';
export type {
  CellAlign,
  Column,
  DataTableProps,
  SortDirection,
  SortState,
} from './DataTable';

export { ActionRail } from './ActionRail';
export type { ActionItem, ActionRailProps } from './ActionRail';

export {
  band,
  bandColor,
  border,
  cn,
  color,
  font,
  layout,
  leading,
  radius,
  resolveTone,
  shadow,
  space,
  status,
  statusTone,
  text,
  tokens,
  tone,
  weight,
} from './tokens';
export type {
  BandColors,
  BandName,
  ColorName,
  StatusColors,
  StatusName,
  ToneColors,
  ToneName,
  ToneRef,
} from './tokens';
