import { SearchPanel } from '../components/SearchPanel';

/**
 * Embedded locator for the Salesforce iframe (spec 6.3). Same query API, no
 * top navigation. The app authenticates independently even when embedded.
 */
export function EmbedSearch() {
  return (
    <div className="container">
      <SearchPanel compact />
    </div>
  );
}
