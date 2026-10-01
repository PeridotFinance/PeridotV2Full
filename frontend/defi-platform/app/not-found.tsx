import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { Button } from "@/components/ui/button"
import { fetchAllPostsFromDB } from "@/lib/blog-utils"
import "./not-found.css"

export default async function NotFound() {
  // Fetch recent blog posts for the blog roll
  const allPosts = await fetchAllPostsFromDB()
  const recentPosts = allPosts.slice(0, 6) // Show 6 recent posts

  return (
    <div className="not-found-container">
      {/* Animated background gradient */}
      <div className="not-found-background">
        <div className="gradient-orb orb-1"></div>
        <div className="gradient-orb orb-2"></div>
        <div className="gradient-orb orb-3"></div>
      </div>

      {/* Subtle grid pattern */}
      <div className="grid-pattern"></div>

      <div className="not-found-content">
        {/* Animated 404 number */}
        <div className="error-code-wrapper">
          <h1 className="error-code">
            <span className="digit" style={{ animationDelay: '0s' }}>4</span>
            <span className="digit" style={{ animationDelay: '0.1s' }}>0</span>
            <span className="digit" style={{ animationDelay: '0.2s' }}>4</span>
          </h1>
          <div className="error-code-glow"></div>
        </div>

        {/* Animated message */}
        <div className="error-message-wrapper">
          <p className="error-message">
            The page you're looking for doesn't exist.
          </p>
          <div className="error-underline"></div>
        </div>

        {/* Action buttons with hover effects */}
        <div className="error-actions">
          <Button asChild variant="outline" className="error-button">
            <Link href="/">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Home
            </Link>
          </Button>
          <Button asChild variant="outline" className="error-button">
            <Link href="/blog">
              View Blog
            </Link>
          </Button>
        </div>

        {/* Blog Roll - Small with staggered animations */}
        {recentPosts.length > 0 && (
          <div className="blog-roll-container">
            <h2 className="blog-roll-title">
              Recent Posts
            </h2>
            <div className="blog-roll-list">
              {recentPosts.map((p, index) => (
                <Link
                  key={p.slug}
                  href={`/blog/${p.slug}`}
                  className="blog-roll-item"
                  style={{ animationDelay: `${0.3 + index * 0.1}s` }}
                >
                  <span className="blog-roll-bullet">•</span>
                  <span className="blog-roll-text">{p.title}</span>
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

