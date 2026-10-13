import type { Metadata } from "next";
import Link from "next/link";
import { formatPostDate, getPublishedPosts, type BlogPostSummary } from "../../../lib/blog";
import styles from "./blog.module.css";

export const revalidate = 300;

export const metadata: Metadata = {
  title: "The FreeReader Blog",
  description: "Reading tips, accessibility guides, and product updates from FreeReader — text to speech for books, documents, and articles.",
  alternates: { canonical: "/blog" },
};

function ArrowIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <path d="M4 10h11M11 5l5 5-5 5" />
    </svg>
  );
}

function PostMeta({ post }: { post: BlogPostSummary }) {
  return (
    <div className={styles.meta}>
      {post.category && <span className={styles.category}>{post.category}</span>}
      <span>{formatPostDate(post.published_at)}</span>
      {post.read_time_minutes && <><span className={styles.dot} /> <span>{post.read_time_minutes} min read</span></>}
    </div>
  );
}

function Cover({ post, className }: { post: BlogPostSummary; className: string }) {
  if (post.cover_image_url) {
    return <img className={className} src={post.cover_image_url} alt="" loading="lazy" />;
  }
  return (
    <div className={`${className} ${styles.coverFallback}`} aria-hidden="true">
      <span>{post.category ?? "FreeReader"}</span>
    </div>
  );
}

export default async function BlogIndexPage() {
  let posts: BlogPostSummary[] = [];
  try {
    posts = await getPublishedPosts();
  } catch {
    posts = [];
  }
  const [featured, ...rest] = posts;

  return (
    <main className={styles.page}>
      <section className={styles.hero}>
        <div className="wrap">
          <span className="eyebrow">Blog</span>
          <h1>Reading, out loud.</h1>
          <p className={styles.heroLead}>
            Accessibility guides, reading tips, and product updates from the team making it easier
            to listen to books, documents, and articles.
          </p>
        </div>
      </section>

      {posts.length === 0 ? (
        <section className="wrap">
          <p className={styles.empty}>New articles are on the way. Check back soon.</p>
        </section>
      ) : (
        <>
          <section className={`wrap ${styles.featuredSection}`} aria-labelledby="featured-heading">
            <h2 id="featured-heading" className="sr-only">Featured article</h2>
            <Link className={styles.featured} href={`/blog/${featured.slug}`}>
              <Cover post={featured} className={styles.featuredCover} />
              <div className={styles.featuredBody}>
                <PostMeta post={featured} />
                <h3>{featured.title}</h3>
                <p>{featured.excerpt}</p>
                <span className={`text-link ${styles.readMore}`}>Read article <ArrowIcon /></span>
              </div>
            </Link>
          </section>

          {rest.length > 0 && (
            <section className={`wrap ${styles.gridSection}`} aria-labelledby="all-posts-heading">
              <h2 id="all-posts-heading" className={styles.sectionHeading}>Latest articles</h2>
              <div className={styles.grid}>
                {rest.map((post) => (
                  <Link className={styles.card} href={`/blog/${post.slug}`} key={post.id}>
                    <Cover post={post} className={styles.cardCover} />
                    <div className={styles.cardBody}>
                      <PostMeta post={post} />
                      <h3>{post.title}</h3>
                      <p>{post.excerpt}</p>
                      <span className={styles.author}>By {post.author_name}</span>
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          )}
        </>
      )}

      <section className={styles.cta}>
        <div className="wrap">
          <h2>Start listening for free.</h2>
          <p>Turn any book, document, or article into an audiobook in seconds.</p>
          <Link className="button" href="/reader">Open audiobook reader <ArrowIcon /></Link>
        </div>
      </section>
    </main>
  );
}
