import { useEffect, useRef, type MouseEvent, type ReactNode, type SyntheticEvent } from 'react';
import styles from './ModalShell.module.css';

interface ModalShellProps {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
  footer: ReactNode;
}

export default function ModalShell({
  title,
  subtitle,
  onClose,
  children,
  footer,
}: ModalShellProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = `${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-modal-title`;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (!dialog.open) dialog.showModal();

    return () => {
      if (dialog.open) dialog.close();
    };
  }, []);

  const handleBackdropClick = (event: MouseEvent<HTMLDialogElement>) => {
    if (event.target === dialogRef.current) {
      onClose();
    }
  };

  const handleCancel = (event: SyntheticEvent<HTMLDialogElement>) => {
    event.preventDefault();
    onClose();
  };

  return (
    <dialog
      ref={dialogRef}
      className={styles.dialog}
      aria-modal="true"
      aria-labelledby={titleId}
      onClick={handleBackdropClick}
      onCancel={handleCancel}
    >
      <div className={styles.modalInner} onClick={(event) => event.stopPropagation()}>
        <header className={styles.header}>
          <div className={styles.titleGroup}>
            <h2 id={titleId} className={styles.title}>{title}</h2>
            {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
          </div>
          <button
            type="button"
            className={styles.closeButton}
            onClick={onClose}
            aria-label={`Close ${title}`}
          >
            x
          </button>
        </header>

        <div className={styles.body}>
          {children}
        </div>

        <footer className={styles.footer}>
          {footer}
        </footer>
      </div>
    </dialog>
  );
}
