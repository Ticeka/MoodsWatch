-- Repair cleanup-stale-party-rooms scheduling for databases where the previous
-- migration attempted to unschedule a missing pg_cron job.
create extension if not exists pg_cron with schema extensions;

do $$
declare
  v_cleanup_job_id bigint;
begin
  if to_regprocedure('cron.schedule(text,text,text)') is not null then
    if to_regclass('cron.job') is not null then
      select jobid
      into v_cleanup_job_id
      from cron.job
      where jobname = 'cleanup-stale-party-rooms'
      limit 1;
    end if;

    if v_cleanup_job_id is not null then
      execute 'select cron.unschedule($1)' using v_cleanup_job_id;
    end if;

    execute 'select cron.schedule($1, $2, $3)'
      using
        'cleanup-stale-party-rooms',
        '*/15 * * * *',
        'select public.cleanup_stale_party_rooms();';
  end if;
exception
  when undefined_function or invalid_schema_name or insufficient_privilege then
    null;
end $$;
