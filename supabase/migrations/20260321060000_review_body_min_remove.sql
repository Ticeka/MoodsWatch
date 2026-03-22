-- Sprint 5 UX: remove 10-char minimum on review body
ALTER TABLE public.title_reviews
  DROP CONSTRAINT IF EXISTS title_reviews_body_check;

ALTER TABLE public.title_reviews
  ADD CONSTRAINT title_reviews_body_check
  CHECK (char_length(trim(body)) >= 1 AND char_length(body) <= 500);
