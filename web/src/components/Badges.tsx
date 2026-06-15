import type { AccessRestriction, ServiceCapability } from '@dealer/shared';

export function StopTowBadge({ on }: { on: boolean }) {
  if (!on) return null;
  return <span className="badge stop">⛔ Stop Tow</span>;
}

export function EvBadge({ certified }: { certified: boolean }) {
  if (!certified) return null;
  return <span className="badge ev">⚡ EV-Certified</span>;
}

export function CapabilityChips({ caps }: { caps: ServiceCapability[] }) {
  return (
    <>
      {caps.map((c) => (
        <span key={c} className="badge cap">
          {c}
        </span>
      ))}
    </>
  );
}

export function RestrictionBadges({ restrictions }: { restrictions: AccessRestriction[] }) {
  return (
    <>
      {restrictions.map((r) => (
        <span key={r.restriction_id} className="badge restrict" title={r.description}>
          ⚠ {r.type}
          {r.alternate_option ? ` — alt: ${r.alternate_option}` : ''}
        </span>
      ))}
    </>
  );
}
