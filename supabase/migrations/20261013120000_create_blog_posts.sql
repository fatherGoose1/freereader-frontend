-- Blog posts for the FreeReader marketing site.
-- Content is authored by the team (dashboard/service role); the public anon key
-- may only read rows that have been published.

create table if not exists public.blog_posts (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  excerpt text,
  content text not null,
  cover_image_url text,
  author_name text not null default 'FreeReader Team',
  category text,
  read_time_minutes integer,
  status text not null default 'draft' check (status in ('draft', 'published')),
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists blog_posts_status_published_at_idx
  on public.blog_posts (status, published_at desc);

create index if not exists blog_posts_category_idx
  on public.blog_posts (category);

create or replace function public.set_blog_posts_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists blog_posts_set_updated_at on public.blog_posts;
create trigger blog_posts_set_updated_at
  before update on public.blog_posts
  for each row execute function public.set_blog_posts_updated_at();

alter table public.blog_posts enable row level security;

drop policy if exists "Published blog posts are publicly readable" on public.blog_posts;
create policy "Published blog posts are publicly readable"
  on public.blog_posts
  for select
  to anon, authenticated
  using (status = 'published');

grant select on public.blog_posts to anon, authenticated;
