-- Audit events stay append-only: UPDATE is always refused, and so is
-- DELETE, except inside the single transaction that deletes a whole
-- tenancy nobody else has joined. That transaction sets
-- rentshield.purge = 'on' (SET LOCAL, so it never leaks to other work).
CREATE OR REPLACE FUNCTION audit_event_immutable() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' AND current_setting('rentshield.purge', true) = 'on' THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'AuditEvent rows are append-only';
END;
$$ LANGUAGE plpgsql;
