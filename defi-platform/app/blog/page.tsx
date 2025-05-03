import Link from "next/link"
import Image from "next/image"
import { Button } from "@/components/ui/button"
import { Card, CardDescription, CardFooter, CardTitle } from "@/components/ui/card"
import { ArrowRight, Calendar, User } from "lucide-react"
import PostPreview from "@/components/blog/post-preview"
import { getAllPosts } from "@/lib/blog-utils"
import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Blog | Peridot - Cross-Chain DeFi Lending Platform",
  description: "Stay updated with the latest news, tutorials, and insights about Peridot and the DeFi ecosystem.",
  openGraph: {
    title: "Peridot Blog - Cross-Chain DeFi Insights",
    description: "Stay updated with the latest news, tutorials, and insights about Peridot and the DeFi ecosystem.",
    images: [
      {
        url: "/og-blog.jpg",
        width: 1200,
        height: 630,
        alt: "Peridot Blog",
      },
    ],
  },
}

export default async function Blog() {
  const allPosts = getAllPosts()
  const featuredPost = allPosts[0]
  const morePosts = allPosts.slice(1)

  return (
    <div className="flex flex-col min-h-screen">
      {/* Hero Section */}
      <section className="py-16 md:py-24 hero-gradient">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl mx-auto text-center">
            <h1 className="text-4xl md:text-5xl font-bold mb-6">Peridot Blog</h1>
            <p className="text-lg text-text/80 mb-8">
              Stay updated with the latest news, tutorials, and insights about Peridot and the DeFi ecosystem.
            </p>
          </div>
        </div>
      </section>

      {/* Featured Post */}
      <section className="py-12 bg-background">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl font-bold mb-8">Featured Post</h2>
          <Card className="bg-card border-border/50 overflow-hidden">
            <div className="grid md:grid-cols-2 gap-6">
              <div className="relative h-64 md:h-auto">
                <Image
                  src={featuredPost.coverImage || `/placeholder.svg?height=600&width=800&query=${featuredPost.title}`}
                  alt={featuredPost.title}
                  fill
                  className="object-cover"
                />
              </div>
              <div className="p-6 flex flex-col justify-center">
                <div className="flex items-center text-sm text-text/60 mb-3">
                  <span className="bg-primary/20 text-primary px-2 py-1 rounded-full text-xs font-medium">
                    Featured
                  </span>
                  <span className="mx-2">•</span>
                  <Calendar className="h-4 w-4 mr-1" />
                  <span>
                    {new Date(featuredPost.date).toLocaleDateString("en-US", {
                      year: "numeric",
                      month: "long",
                      day: "numeric",
                    })}
                  </span>
                </div>
                <CardTitle className="text-2xl mb-3">{featuredPost.title}</CardTitle>
                <CardDescription className="text-text/70 mb-6">{featuredPost.excerpt}</CardDescription>
                <CardFooter className="px-0 pt-4 pb-0 flex items-center justify-between">
                  <div className="flex items-center">
                    <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center mr-2 overflow-hidden">
                      {featuredPost.author.picture ? (
                        <Image
                          src={featuredPost.author.picture || "/placeholder.svg"}
                          alt={featuredPost.author.name}
                          width={32}
                          height={32}
                        />
                      ) : (
                        <User className="h-4 w-4" />
                      )}
                    </div>
                    <span className="text-sm">{featuredPost.author.name}</span>
                  </div>
                  <Button
                    asChild
                    variant="ghost"
                    className="text-primary hover:text-primary/90 hover:bg-primary/10 -mr-4"
                  >
                    <Link href={`/blog/${featuredPost.slug}`}>
                      Read More
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </Link>
                  </Button>
                </CardFooter>
              </div>
            </div>
          </Card>
        </div>
      </section>

      {/* Blog Posts */}
      <section className="py-12 bg-background">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center mb-8">
            <h2 className="text-2xl font-bold">Latest Articles</h2>
            <div className="flex space-x-2">
              <Button variant="outline" size="sm">
                All
              </Button>
              <Button variant="ghost" size="sm">
                Education
              </Button>
              <Button variant="ghost" size="sm">
                Features
              </Button>
              <Button variant="ghost" size="sm">
                Security
              </Button>
            </div>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {morePosts.map((post) => (
              <PostPreview key={post.slug} post={post} />
            ))}
          </div>

          <div className="mt-12 text-center">
            <Button variant="outline" size="lg">
              Load More Articles
            </Button>
          </div>
        </div>
      </section>

      {/* Newsletter */}
      <section className="py-16 bg-muted">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-2xl mx-auto text-center">
            <h2 className="text-2xl font-bold mb-4">Subscribe to Our Newsletter</h2>
            <p className="text-text/70 mb-6">
              Get the latest updates, articles, and insights about Peridot and DeFi delivered straight to your inbox.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 max-w-md mx-auto">
              <input
                type="email"
                placeholder="Enter your email"
                className="px-4 py-2 rounded-md bg-background border border-border focus:outline-none focus:ring-2 focus:ring-primary flex-grow"
              />
              <Button className="bg-primary text-background hover:bg-primary/90">Subscribe</Button>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
