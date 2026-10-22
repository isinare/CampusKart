/**
 * Layout boundary for the application. The preserved renderer expects the
 * eight containers from the original page; they are provided by the components
 * in `src/components/Layout.jsx` and composed by `CampusKartPage`.
 */
export default function SiteLayout({ children }) {
  return <div className="site-layout">{children}</div>;
}
