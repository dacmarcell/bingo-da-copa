-- Security hardening
--
-- 1. Payment tables were created without RLS -> lock them down (service_role only).
-- 2. Tighten table grants to exactly what the client needs (defense in depth on top of RLS).
-- 3. Game integrity: clients could write their own score / swaps_count / cards / premium rooms.
--    Rooms, participants and cards are now created through SECURITY DEFINER RPCs, cards can
--    only have their `marked` flags changed, and the score is computed by the database.

-- ---------------------------------------------------------------------------
-- 1. Payment tables: deny everything to anon/authenticated
-- ---------------------------------------------------------------------------
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pixup_tokens ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.transactions, public.payment_audit_logs, public.pixup_tokens
  FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.transactions, public.payment_audit_logs, public.pixup_tokens TO service_role;

ALTER TABLE public.transactions
  ADD CONSTRAINT transactions_status_check
  CHECK (status IN ('PENDING', 'PAID', 'EXPIRED', 'CANCELLED', 'REFUNDED', 'FAILED')) NOT VALID;

-- ---------------------------------------------------------------------------
-- 2. Explicit, minimal grants
-- ---------------------------------------------------------------------------
REVOKE ALL ON public.profiles, public.user_roles, public.matches, public.rooms,
  public.room_participants, public.cards, public.subscriptions
  FROM anon, authenticated;

GRANT SELECT ON public.matches TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.matches TO authenticated;

GRANT SELECT ON public.profiles TO authenticated;
GRANT INSERT (id, display_name, avatar_url) ON public.profiles TO authenticated;
GRANT UPDATE (display_name, avatar_url) ON public.profiles TO authenticated;

GRANT SELECT ON public.user_roles TO authenticated;
GRANT SELECT ON public.subscriptions TO authenticated;

-- rooms are created by create_room(); the creator may only close them
GRANT SELECT, DELETE ON public.rooms TO authenticated;
GRANT UPDATE (status, finished_at) ON public.rooms TO authenticated;

-- participants are managed exclusively by RPCs and triggers
GRANT SELECT ON public.room_participants TO authenticated;

-- cards are created by RPCs; clients may only toggle marks
GRANT SELECT ON public.cards TO authenticated;
GRANT UPDATE (cells) ON public.cards TO authenticated;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_display_name_len CHECK (char_length(display_name) BETWEEN 1 AND 40) NOT VALID,
  ADD CONSTRAINT profiles_avatar_url_https CHECK (avatar_url IS NULL OR avatar_url ~* '^https://') NOT VALID;

-- Truncate names coming from signup metadata instead of failing the signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name, avatar_url)
  VALUES (
    NEW.id,
    left(COALESCE(NULLIF(btrim(NEW.raw_user_meta_data->>'display_name'), ''), NULLIF(btrim(NEW.raw_user_meta_data->>'full_name'), ''), NULLIF(split_part(NEW.email,'@',1), ''), 'Torcedor'), 40),
    CASE WHEN NEW.raw_user_meta_data->>'avatar_url' ~* '^https://' THEN NEW.raw_user_meta_data->>'avatar_url' END
  );
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'user');
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- 3. Game integrity
-- ---------------------------------------------------------------------------

-- Event pools live in the database so cards can be generated server-side.
CREATE TABLE public.bingo_events (
  theme public.card_theme NOT NULL,
  event TEXT NOT NULL,
  PRIMARY KEY (theme, event)
);
ALTER TABLE public.bingo_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.bingo_events FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.bingo_events TO service_role;

INSERT INTO public.bingo_events (theme, event) VALUES
  ('classic', 'Gol'),
  ('classic', 'Cartão amarelo'),
  ('classic', 'Cartão vermelho'),
  ('classic', 'Escanteio'),
  ('classic', 'Impedimento'),
  ('classic', 'Pênalti'),
  ('classic', 'Chute na trave'),
  ('classic', 'Acréscimos no 2º tempo'),
  ('classic', 'VAR'),
  ('classic', 'Alguém xinga o juiz'),
  ('classic', 'Levantou do sofá pra reclamar'),
  ('classic', 'Comentarista interrompe'),
  ('classic', 'Narrador cita jogo antigo'),
  ('classic', 'Close em torcedor chorando'),
  ('classic', 'Casal aparece no telão'),
  ('classic', 'Criança fantasiada'),
  ('classic', 'Torcedor pintado'),
  ('classic', 'Celebridade aparece'),
  ('classic', 'Torcedor nervoso'),
  ('classic', 'Substituição'),
  ('classic', 'Erro de passe'),
  ('classic', 'Falta perigosa'),
  ('classic', 'Goleiro defende'),
  ('classic', 'Bola na lateral'),
  ('classic', 'Lance polêmico'),
  ('churrasco', 'Carne queimou'),
  ('churrasco', 'Acabou o gelo'),
  ('churrasco', 'Xingou o juiz'),
  ('churrasco', 'Derrubaram cerveja'),
  ('churrasco', 'Discussão sobre impedimento'),
  ('churrasco', 'Pessoa chegou atrasada'),
  ('churrasco', 'Falou do 7x1'),
  ('churrasco', 'Pediu mais pão de alho'),
  ('churrasco', 'Esqueceu de trazer algo'),
  ('churrasco', 'Criança correndo'),
  ('churrasco', 'Reclamou do preço da carne'),
  ('churrasco', 'Dormiu na cadeira'),
  ('churrasco', 'Acabou o carvão'),
  ('churrasco', 'Falou de política'),
  ('churrasco', 'Perguntou regra do impedimento'),
  ('churrasco', 'Derrubou comida'),
  ('churrasco', 'Comemorou antes da hora'),
  ('churrasco', 'Reclamação do VAR'),
  ('churrasco', 'Reclamou dos jogadores atuais'),
  ('churrasco', 'Citou Pelé'),
  ('churrasco', 'Citou Maradona'),
  ('churrasco', 'Pediu o sal'),
  ('churrasco', 'Trocou a música'),
  ('churrasco', 'Chegou mais gente'),
  ('churrasco', 'Acabou a cerveja'),
  ('familia', 'Reclama do técnico'),
  ('familia', 'Antigamente era melhor'),
  ('familia', 'Chegou no meio do jogo'),
  ('familia', 'Não entende as regras'),
  ('familia', 'Pergunta o placar'),
  ('familia', 'Torce para outro país'),
  ('familia', 'Discute melhor jogador'),
  ('familia', 'Fala do Pelé'),
  ('familia', 'Pergunta se saiu a carne'),
  ('familia', 'Vai à cozinha no melhor lance'),
  ('familia', 'Pede refrigerante'),
  ('familia', 'Acaba o petisco'),
  ('familia', 'Reclama da comida'),
  ('familia', 'Aparece com prato cheio'),
  ('familia', 'Pergunta da sobremesa'),
  ('familia', 'Derruba comida'),
  ('familia', 'Volta da cozinha e pergunta'),
  ('familia', 'Pede o controle remoto'),
  ('familia', 'Aumenta o volume'),
  ('familia', 'Reclama do volume'),
  ('familia', 'Criança muda o canal'),
  ('familia', 'Bloqueia a visão da TV'),
  ('familia', 'Mexe na internet'),
  ('familia', 'Atende o telefone alto'),
  ('familia', 'Tira foto da TV')
;

-- Internal helpers ----------------------------------------------------------

CREATE OR REPLACE FUNCTION public.is_premium(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.subscriptions
    WHERE user_id = _user_id AND active AND (expires_at IS NULL OR expires_at > now())
  )
$$;

CREATE OR REPLACE FUNCTION public.generate_bingo_cells(_theme public.card_theme)
RETURNS JSONB
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  evs TEXT[];
  result JSONB := '[]'::jsonb;
  i INT;
  k INT := 1;
BEGIN
  SELECT array_agg(t.event) INTO evs
  FROM (SELECT be.event FROM public.bingo_events be WHERE be.theme = _theme ORDER BY random() LIMIT 24) t;

  IF evs IS NULL OR array_length(evs, 1) < 24 THEN
    RAISE EXCEPTION 'not_enough_events';
  END IF;

  FOR i IN 0..24 LOOP
    IF i = 12 THEN
      result := result || jsonb_build_array(jsonb_build_object('event', 'FREE', 'marked', true, 'free', true));
    ELSE
      result := result || jsonb_build_array(jsonb_build_object('event', evs[k], 'marked', false));
      k := k + 1;
    END IF;
  END LOOP;

  RETURN result;
END;
$$;

-- Mirrors computeScore() in src/lib/bingo.ts
CREATE OR REPLACE FUNCTION public.compute_bingo_score(_cells JSONB, OUT score INT, OUT marks INT, OUT bingos INT)
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  m BOOLEAN[] := array_fill(false, ARRAY[25]);
  i INT;
  n_lines INT := 0;
  is_full BOOLEAN := true;
  ln INT[];
  line_defs INT[][] := ARRAY[
    [1,2,3,4,5], [6,7,8,9,10], [11,12,13,14,15], [16,17,18,19,20], [21,22,23,24,25],
    [1,6,11,16,21], [2,7,12,17,22], [3,8,13,18,23], [4,9,14,19,24], [5,10,15,20,25],
    [1,7,13,19,25], [5,9,13,17,21]
  ];
BEGIN
  marks := 0;
  FOR i IN 0..24 LOOP
    m[i + 1] := COALESCE((_cells -> i ->> 'marked')::boolean, false);
    IF NOT m[i + 1] THEN
      is_full := false;
    ELSIF NOT COALESCE((_cells -> i ->> 'free')::boolean, false) THEN
      marks := marks + 1;
    END IF;
  END LOOP;

  FOREACH ln SLICE 1 IN ARRAY line_defs LOOP
    IF m[ln[1]] AND m[ln[2]] AND m[ln[3]] AND m[ln[4]] AND m[ln[5]] THEN
      n_lines := n_lines + 1;
    END IF;
  END LOOP;

  score := marks * 10 + n_lines * 50 + (CASE WHEN n_lines > 0 THEN 200 ELSE 0 END) + (CASE WHEN is_full THEN 500 ELSE 0 END);
  bingos := (CASE WHEN n_lines > 0 THEN 1 ELSE 0 END) + (CASE WHEN is_full THEN 1 ELSE 0 END);
END;
$$;

-- Triggers ------------------------------------------------------------------

-- Runs as the caller (SECURITY INVOKER) so current_user tells us whether the write comes
-- straight from the API (authenticated) or from a SECURITY DEFINER RPC (function owner).
CREATE OR REPLACE FUNCTION public.guard_card_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  i INT;
BEGIN
  IF current_user NOT IN ('anon', 'authenticated') THEN
    RETURN NEW;
  END IF;

  IF NEW.id <> OLD.id OR NEW.room_id <> OLD.room_id OR NEW.user_id <> OLD.user_id THEN
    RAISE EXCEPTION 'card_immutable_fields' USING ERRCODE = '42501';
  END IF;

  IF jsonb_typeof(NEW.cells) <> 'array' OR jsonb_array_length(NEW.cells) <> 25 THEN
    RAISE EXCEPTION 'invalid_card' USING ERRCODE = '22023';
  END IF;

  FOR i IN 0..24 LOOP
    IF jsonb_typeof(NEW.cells -> i -> 'marked') IS DISTINCT FROM 'boolean'
       OR (NEW.cells -> i) - 'marked' <> (OLD.cells -> i) - 'marked' THEN
      RAISE EXCEPTION 'card_events_are_immutable' USING ERRCODE = '42501';
    END IF;
    IF COALESCE((OLD.cells -> i ->> 'free')::boolean, false)
       AND (NEW.cells -> i ->> 'marked')::boolean IS DISTINCT FROM true THEN
      RAISE EXCEPTION 'free_cell_must_stay_marked' USING ERRCODE = '42501';
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

CREATE TRIGGER cards_guard_update
BEFORE UPDATE ON public.cards
FOR EACH ROW EXECUTE FUNCTION public.guard_card_update();

CREATE OR REPLACE FUNCTION public.guard_room_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF current_user IN ('anon', 'authenticated') AND OLD.status = 'finished' AND NEW.status <> 'finished' THEN
    RAISE EXCEPTION 'room_already_finished' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER rooms_guard_update
BEFORE UPDATE ON public.rooms
FOR EACH ROW EXECUTE FUNCTION public.guard_room_update();

-- The score is derived from the card, never written by clients.
CREATE OR REPLACE FUNCTION public.sync_participant_score()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  s RECORD;
BEGIN
  SELECT * INTO s FROM public.compute_bingo_score(NEW.cells);
  UPDATE public.room_participants rp
  SET score = s.score, marks_count = s.marks, bingos = s.bingos
  WHERE rp.room_id = NEW.room_id AND rp.user_id = NEW.user_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER cards_sync_score
AFTER INSERT OR UPDATE OF cells ON public.cards
FOR EACH ROW EXECUTE FUNCTION public.sync_participant_score();

-- Policies ------------------------------------------------------------------

-- rooms: no direct INSERT; update limited to creator/admin (columns limited by GRANT)
DROP POLICY "Authenticated create rooms" ON public.rooms;
DROP POLICY "Creator or admin update room" ON public.rooms;
CREATE POLICY "Creator or admin update room" ON public.rooms FOR UPDATE TO authenticated
  USING (auth.uid() = creator_id OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (auth.uid() = creator_id OR public.has_role(auth.uid(), 'admin'));

-- room_participants: read-only for clients (no leave/rejoin to reset swaps or score)
DROP POLICY "User joins as self" ON public.room_participants;
DROP POLICY "User updates own participation" ON public.room_participants;
DROP POLICY "User leaves own participation" ON public.room_participants;

-- cards: private to their owner, editable only while the room is running
DROP POLICY "Cards viewable by authenticated" ON public.cards;
DROP POLICY "User creates own card" ON public.cards;
DROP POLICY "User updates own card" ON public.cards;
CREATE POLICY "User sees own card" ON public.cards FOR SELECT TO authenticated
  USING (auth.uid() = user_id);
CREATE POLICY "User marks own card" ON public.cards FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (SELECT 1 FROM public.rooms r WHERE r.id = room_id AND r.status <> 'finished')
  );

-- Public RPCs ---------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.create_room(_match_id UUID, _theme public.card_theme)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid UUID := auth.uid();
  m RECORD;
  room_code TEXT;
  new_room_id UUID;
  display TEXT;
  bytes BYTEA;
  attempts INT := 0;
  i INT;
  alphabet CONSTANT TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; -- 32 chars: no modulo bias
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;
  IF _theme <> 'classic' AND NOT public.is_premium(uid) THEN
    RAISE EXCEPTION 'premium_required' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO m FROM public.matches WHERE id = _match_id;
  IF NOT FOUND OR m.status = 'finished' THEN
    RAISE EXCEPTION 'match_unavailable' USING ERRCODE = 'P0002';
  END IF;

  IF (SELECT count(*) FROM public.rooms r WHERE r.creator_id = uid AND r.status <> 'finished') >= 10 THEN
    RAISE EXCEPTION 'too_many_open_rooms' USING ERRCODE = '54000';
  END IF;

  LOOP
    bytes := decode(replace(gen_random_uuid()::text, '-', ''), 'hex');
    room_code := '';
    FOR i IN 0..5 LOOP
      room_code := room_code || substr(alphabet, 1 + (get_byte(bytes, i) % 32), 1);
    END LOOP;

    BEGIN
      INSERT INTO public.rooms (code, name, match_id, creator_id, theme)
      VALUES (room_code, 'Sala ' || m.team_a_code || ' x ' || m.team_b_code, _match_id, uid, _theme)
      RETURNING id INTO new_room_id;
      EXIT;
    EXCEPTION WHEN unique_violation THEN
      attempts := attempts + 1;
      IF attempts > 5 THEN RAISE; END IF;
    END;
  END LOOP;

  SELECT p.display_name INTO display FROM public.profiles p WHERE p.id = uid;
  INSERT INTO public.room_participants (room_id, user_id, display_name)
  VALUES (new_room_id, uid, COALESCE(display, 'Torcedor'));
  INSERT INTO public.cards (room_id, user_id, cells)
  VALUES (new_room_id, uid, public.generate_bingo_cells(_theme));

  RETURN room_code;
END;
$$;

CREATE OR REPLACE FUNCTION public.join_room(_code TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid UUID := auth.uid();
  r RECORD;
  display TEXT;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT * INTO r FROM public.rooms WHERE code = upper(btrim(_code));
  IF NOT FOUND THEN
    RAISE EXCEPTION 'room_not_found' USING ERRCODE = 'P0002';
  END IF;

  -- Finished rooms can still be viewed, but nobody new can join them
  IF r.status <> 'finished' AND NOT EXISTS (
    SELECT 1 FROM public.room_participants rp WHERE rp.room_id = r.id AND rp.user_id = uid
  ) THEN
    IF (SELECT count(*) FROM public.room_participants rp WHERE rp.room_id = r.id) >= 200 THEN
      RAISE EXCEPTION 'room_full' USING ERRCODE = '54000';
    END IF;

    SELECT p.display_name INTO display FROM public.profiles p WHERE p.id = uid;
    INSERT INTO public.room_participants (room_id, user_id, display_name)
    VALUES (r.id, uid, COALESCE(display, 'Torcedor'))
    ON CONFLICT (room_id, user_id) DO NOTHING;
    INSERT INTO public.cards (room_id, user_id, cells)
    VALUES (r.id, uid, public.generate_bingo_cells(r.theme))
    ON CONFLICT (room_id, user_id) DO NOTHING;
  END IF;

  RETURN r.id;
END;
$$;

CREATE OR REPLACE FUNCTION public.swap_card(_room_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid UUID := auth.uid();
  r RECORD;
  swaps INT;
  new_cells JSONB;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;
  IF NOT public.is_premium(uid) THEN
    RAISE EXCEPTION 'premium_required' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO r FROM public.rooms WHERE id = _room_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'room_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF r.status = 'finished' THEN
    RAISE EXCEPTION 'room_finished' USING ERRCODE = '42501';
  END IF;

  -- Atomic check + increment: concurrent requests cannot exceed the limit
  UPDATE public.room_participants rp
  SET swaps_count = rp.swaps_count + 1
  WHERE rp.room_id = _room_id AND rp.user_id = uid AND rp.swaps_count < 3
  RETURNING rp.swaps_count INTO swaps;

  IF NOT FOUND THEN
    IF EXISTS (SELECT 1 FROM public.room_participants rp WHERE rp.room_id = _room_id AND rp.user_id = uid) THEN
      RAISE EXCEPTION 'swap_limit_reached' USING ERRCODE = '42501';
    END IF;
    RAISE EXCEPTION 'not_a_participant' USING ERRCODE = 'P0002';
  END IF;

  new_cells := public.generate_bingo_cells(r.theme);
  UPDATE public.cards c SET cells = new_cells WHERE c.room_id = _room_id AND c.user_id = uid;

  RETURN jsonb_build_object('success', true, 'cells', new_cells, 'swaps_remaining', 3 - swaps);
END;
$$;

-- Function privileges -------------------------------------------------------
-- Functions in `public` are exposed by PostgREST as RPC: only the three RPCs above
-- may be called by clients; everything else is internal.
REVOKE EXECUTE ON FUNCTION public.is_premium(UUID) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.generate_bingo_cells(public.card_theme) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.compute_bingo_score(JSONB) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.guard_card_update() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.guard_room_update() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_participant_score() FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.create_room(UUID, public.card_theme) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.join_room(TEXT) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.swap_card(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_room(UUID, public.card_theme) TO authenticated;
GRANT EXECUTE ON FUNCTION public.join_room(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.swap_card(UUID) TO authenticated;
