import { SearchPanel } from '../components/SearchPanel';

export function Search() {
  return (
    <>
      <h2>Proximity search</h2>
      <p className="muted">
        Returns up to 5 nearest eligible dealers ranked by drive time. EV routing,
        Stop Tow, access restrictions and opening hours are applied automatically.
      </p>
      <SearchPanel />
    </>
  );
}
