drop extension if exists "pg_net";


  create table "public"."dispute_evidence" (
    "id" uuid not null default gen_random_uuid(),
    "dispute_id" uuid not null,
    "user_id" uuid not null,
    "evidence_type" text not null,
    "file_url" text not null,
    "file_name" text,
    "file_size" integer,
    "description" text,
    "created_at" timestamp with time zone default now()
      );


alter table "public"."dispute_evidence" enable row level security;


  create table "public"."dispute_messages" (
    "id" uuid not null default gen_random_uuid(),
    "dispute_id" uuid not null,
    "sender_id" uuid not null,
    "message_type" text not null default 'user'::text,
    "content" text not null,
    "is_internal" boolean not null default false,
    "created_at" timestamp with time zone default now()
      );


alter table "public"."dispute_messages" enable row level security;

alter table "public"."disputes" add column "admin_notes" text;

alter table "public"."disputes" add column "currency" text not null default 'aud'::text;

alter table "public"."disputes" add column "description" text;

alter table "public"."disputes" add column "dispute_type" text not null default 'other'::text;

alter table "public"."disputes" add column "initiator_id" uuid;

alter table "public"."disputes" add column "refund_amount_cents" integer;

alter table "public"."disputes" add column "resolution" text;

alter table "public"."disputes" add column "resolution_type" text;

alter table "public"."disputes" add column "resolved_at" timestamp with time zone;

alter table "public"."disputes" add column "respondent_id" uuid;

alter table "public"."disputes" add column "status" text not null default 'open'::text;

CREATE UNIQUE INDEX dispute_evidence_pkey ON public.dispute_evidence USING btree (id);

CREATE UNIQUE INDEX dispute_messages_pkey ON public.dispute_messages USING btree (id);

CREATE INDEX idx_dispute_evidence_dispute_id ON public.dispute_evidence USING btree (dispute_id);

CREATE INDEX idx_dispute_evidence_user_id ON public.dispute_evidence USING btree (user_id);

CREATE INDEX idx_dispute_messages_created_at ON public.dispute_messages USING btree (created_at DESC);

CREATE INDEX idx_dispute_messages_dispute_id ON public.dispute_messages USING btree (dispute_id);

CREATE INDEX idx_disputes_created_at ON public.disputes USING btree (created_at DESC);

CREATE INDEX idx_disputes_initiator_id ON public.disputes USING btree (initiator_id);

CREATE INDEX idx_disputes_order_id ON public.disputes USING btree (order_id);

CREATE INDEX idx_disputes_respondent_id ON public.disputes USING btree (respondent_id);

CREATE INDEX idx_disputes_status ON public.disputes USING btree (status);

alter table "public"."dispute_evidence" add constraint "dispute_evidence_pkey" PRIMARY KEY using index "dispute_evidence_pkey";

alter table "public"."dispute_messages" add constraint "dispute_messages_pkey" PRIMARY KEY using index "dispute_messages_pkey";

alter table "public"."dispute_evidence" add constraint "dispute_evidence_dispute_id_fkey" FOREIGN KEY (dispute_id) REFERENCES disputes(id) ON DELETE CASCADE not valid;

alter table "public"."dispute_evidence" validate constraint "dispute_evidence_dispute_id_fkey";

alter table "public"."dispute_evidence" add constraint "dispute_evidence_evidence_type_check" CHECK ((evidence_type = ANY (ARRAY['photo'::text, 'document'::text, 'screenshot'::text, 'other'::text]))) not valid;

alter table "public"."dispute_evidence" validate constraint "dispute_evidence_evidence_type_check";

alter table "public"."dispute_evidence" add constraint "dispute_evidence_user_id_fkey" FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE not valid;

alter table "public"."dispute_evidence" validate constraint "dispute_evidence_user_id_fkey";

alter table "public"."dispute_messages" add constraint "dispute_messages_dispute_id_fkey" FOREIGN KEY (dispute_id) REFERENCES disputes(id) ON DELETE CASCADE not valid;

alter table "public"."dispute_messages" validate constraint "dispute_messages_dispute_id_fkey";

alter table "public"."dispute_messages" add constraint "dispute_messages_message_type_check" CHECK ((message_type = ANY (ARRAY['user'::text, 'admin'::text, 'system'::text]))) not valid;

alter table "public"."dispute_messages" validate constraint "dispute_messages_message_type_check";

alter table "public"."dispute_messages" add constraint "dispute_messages_sender_id_fkey" FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE not valid;

alter table "public"."dispute_messages" validate constraint "dispute_messages_sender_id_fkey";

alter table "public"."disputes" add constraint "check_dispute_type" CHECK ((dispute_type = ANY (ARRAY['item_not_received'::text, 'item_not_as_described'::text, 'damaged_item'::text, 'wrong_item'::text, 'other'::text]))) not valid;

alter table "public"."disputes" validate constraint "check_dispute_type";

alter table "public"."disputes" add constraint "check_resolution_type" CHECK (((resolution_type = ANY (ARRAY['full_refund'::text, 'partial_refund'::text, 'replacement'::text, 'compensation'::text, 'no_action'::text])) OR (resolution_type IS NULL))) not valid;

alter table "public"."disputes" validate constraint "check_resolution_type";

alter table "public"."disputes" add constraint "check_status" CHECK ((status = ANY (ARRAY['open'::text, 'under_review'::text, 'resolved'::text, 'closed'::text, 'escalated'::text]))) not valid;

alter table "public"."disputes" validate constraint "check_status";

alter table "public"."disputes" add constraint "disputes_initiator_id_fkey" FOREIGN KEY (initiator_id) REFERENCES users(id) ON DELETE CASCADE not valid;

alter table "public"."disputes" validate constraint "disputes_initiator_id_fkey";

alter table "public"."disputes" add constraint "disputes_respondent_id_fkey" FOREIGN KEY (respondent_id) REFERENCES users(id) ON DELETE CASCADE not valid;

alter table "public"."disputes" validate constraint "disputes_respondent_id_fkey";

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.process_dispute_refund()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    -- If dispute is resolved with a refund, create ledger entry
    IF NEW.status = 'resolved' AND NEW.resolution_type IN ('full_refund', 'partial_refund') AND NEW.refund_amount_cents > 0 THEN
        INSERT INTO ledger_entries (
            order_id,
            user_id,
            amount_cents,
            entry_type,
            description,
            created_at
        ) VALUES (
            NEW.order_id,
            NEW.initiator_id,
            NEW.refund_amount_cents,
            'dispute_refund',
            'Refund processed for dispute ' || NEW.id,
            NOW()
        );
        
        -- Update order state if full refund
        IF NEW.resolution_type = 'full_refund' THEN
            UPDATE orders 
            SET state = 'refunded', updated_at = NOW()
            WHERE id = NEW.order_id;
        END IF;
    END IF;
    
    RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_disputes_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$function$
;

grant delete on table "public"."dispute_evidence" to "anon";

grant insert on table "public"."dispute_evidence" to "anon";

grant references on table "public"."dispute_evidence" to "anon";

grant select on table "public"."dispute_evidence" to "anon";

grant trigger on table "public"."dispute_evidence" to "anon";

grant truncate on table "public"."dispute_evidence" to "anon";

grant update on table "public"."dispute_evidence" to "anon";

grant delete on table "public"."dispute_evidence" to "authenticated";

grant insert on table "public"."dispute_evidence" to "authenticated";

grant references on table "public"."dispute_evidence" to "authenticated";

grant select on table "public"."dispute_evidence" to "authenticated";

grant trigger on table "public"."dispute_evidence" to "authenticated";

grant truncate on table "public"."dispute_evidence" to "authenticated";

grant update on table "public"."dispute_evidence" to "authenticated";

grant delete on table "public"."dispute_evidence" to "service_role";

grant insert on table "public"."dispute_evidence" to "service_role";

grant references on table "public"."dispute_evidence" to "service_role";

grant select on table "public"."dispute_evidence" to "service_role";

grant trigger on table "public"."dispute_evidence" to "service_role";

grant truncate on table "public"."dispute_evidence" to "service_role";

grant update on table "public"."dispute_evidence" to "service_role";

grant delete on table "public"."dispute_messages" to "anon";

grant insert on table "public"."dispute_messages" to "anon";

grant references on table "public"."dispute_messages" to "anon";

grant select on table "public"."dispute_messages" to "anon";

grant trigger on table "public"."dispute_messages" to "anon";

grant truncate on table "public"."dispute_messages" to "anon";

grant update on table "public"."dispute_messages" to "anon";

grant delete on table "public"."dispute_messages" to "authenticated";

grant insert on table "public"."dispute_messages" to "authenticated";

grant references on table "public"."dispute_messages" to "authenticated";

grant select on table "public"."dispute_messages" to "authenticated";

grant trigger on table "public"."dispute_messages" to "authenticated";

grant truncate on table "public"."dispute_messages" to "authenticated";

grant update on table "public"."dispute_messages" to "authenticated";

grant delete on table "public"."dispute_messages" to "service_role";

grant insert on table "public"."dispute_messages" to "service_role";

grant references on table "public"."dispute_messages" to "service_role";

grant select on table "public"."dispute_messages" to "service_role";

grant trigger on table "public"."dispute_messages" to "service_role";

grant truncate on table "public"."dispute_messages" to "service_role";

grant update on table "public"."dispute_messages" to "service_role";


  create policy "Users can add evidence to their disputes"
  on "public"."dispute_evidence"
  as permissive
  for insert
  to public
with check (((auth.uid() = user_id) AND (EXISTS ( SELECT 1
   FROM disputes
  WHERE ((disputes.id = dispute_evidence.dispute_id) AND ((disputes.initiator_id = auth.uid()) OR (disputes.respondent_id = auth.uid())))))));



  create policy "Users can view evidence for their disputes"
  on "public"."dispute_evidence"
  as permissive
  for select
  to public
using ((EXISTS ( SELECT 1
   FROM disputes
  WHERE ((disputes.id = dispute_evidence.dispute_id) AND ((disputes.initiator_id = auth.uid()) OR (disputes.respondent_id = auth.uid()))))));



  create policy "Users can send messages in their disputes"
  on "public"."dispute_messages"
  as permissive
  for insert
  to public
with check (((auth.uid() = sender_id) AND (EXISTS ( SELECT 1
   FROM disputes
  WHERE ((disputes.id = dispute_messages.dispute_id) AND ((disputes.initiator_id = auth.uid()) OR (disputes.respondent_id = auth.uid())))))));



  create policy "Users can view messages for their disputes"
  on "public"."dispute_messages"
  as permissive
  for select
  to public
using ((EXISTS ( SELECT 1
   FROM disputes
  WHERE ((disputes.id = dispute_messages.dispute_id) AND ((disputes.initiator_id = auth.uid()) OR (disputes.respondent_id = auth.uid()))))));



  create policy "Users can create disputes"
  on "public"."disputes"
  as permissive
  for insert
  to public
with check ((auth.uid() = initiator_id));



  create policy "Users can update their disputes"
  on "public"."disputes"
  as permissive
  for update
  to public
using (((auth.uid() = initiator_id) OR (auth.uid() = respondent_id)));



  create policy "Users can view disputes they are involved in"
  on "public"."disputes"
  as permissive
  for select
  to public
using (((auth.uid() = initiator_id) OR (auth.uid() = respondent_id)));


CREATE TRIGGER process_dispute_refund_trigger AFTER UPDATE ON public.disputes FOR EACH ROW EXECUTE FUNCTION process_dispute_refund();

CREATE TRIGGER update_disputes_updated_at_trigger BEFORE UPDATE ON public.disputes FOR EACH ROW EXECUTE FUNCTION update_disputes_updated_at();


