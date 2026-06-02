import React from "react";

interface BreadcrumbItem {
  id: string; // node_id (or "root" for the macro level)
  label: string;
}

interface BreadcrumbsProps {
  breadcrumbs: BreadcrumbItem[];
  rootTitle: string | null;
  onNavigate: (levelId: string | null) => void; // null means reset to home screen, "root" means macro level
}

/**
 * Breadcrumbs component for navigating hierarchical mindmap levels.
 */
export const Breadcrumbs: React.FC<BreadcrumbsProps> = ({
  breadcrumbs,
  rootTitle,
  onNavigate,
}) => {
  return (
    <nav className="breadcrumbs-nav" aria-label="Breadcrumbs">
      <ul className="breadcrumbs-list">
        <li className="breadcrumb-item">
          <button
            onClick={() => onNavigate(null)}
            className="breadcrumb-btn home-btn"
          >
            Home
          </button>
        </li>

        {rootTitle && (
          <>
            <li className="breadcrumb-separator">/</li>
            <li className="breadcrumb-item">
              <button
                onClick={() => onNavigate("root")}
                className={`breadcrumb-btn ${breadcrumbs.length === 0 ? "active" : ""}`}
                disabled={breadcrumbs.length === 0}
              >
                {rootTitle}
              </button>
            </li>
          </>
        )}

        {breadcrumbs.map((crumb, idx) => {
          const isLast = idx === breadcrumbs.length - 1;
          return (
            <React.Fragment key={crumb.id}>
              <li className="breadcrumb-separator">/</li>
              <li className="breadcrumb-item">
                <button
                  onClick={() => onNavigate(crumb.id)}
                  className={`breadcrumb-btn ${isLast ? "active" : ""}`}
                  disabled={isLast}
                >
                  {crumb.label}
                </button>
              </li>
            </React.Fragment>
          );
        })}
      </ul>
    </nav>
  );
};
