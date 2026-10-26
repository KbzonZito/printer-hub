import type { ComponentType } from 'react';

/**
 * Floating navigation bar. Idle items show only their icon; the pressed one grows in
 * place into a pill with its label (styles in .tabbar). The bar keeps a fixed width.
 */
export function NavBar<T extends string>({
  tabs,
  active,
  onSelect,
  label,
}: {
  tabs: { id: T; icon: ComponentType<{ size?: number }> }[];
  active: T;
  onSelect: (id: T) => void;
  label: (id: T) => string;
}) {
  return (
    <nav className="tabbar">
      <img className="rail-logo" src="./icon.svg" alt="" width={40} height={40} />
      {tabs.map(({ id, icon: Icon }) => (
        <button
          key={id}
          className={active === id ? 'active' : ''}
          aria-current={active === id ? 'page' : undefined}
          onClick={() => onSelect(id)}
        >
          <Icon size={22} />
          <span>{label(id)}</span>
        </button>
      ))}
    </nav>
  );
}
