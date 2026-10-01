"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select"
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogTrigger 
} from "@/components/ui/dialog"
import { 
  Mail, 
  Calendar, 
  User, 
  MessageSquare, 
  Eye, 
  Reply,
  Archive,
  RefreshCw
} from "lucide-react"

interface ContactSubmission {
  id: number
  name: string
  email: string
  subject: string
  message: string
  status: 'new' | 'read' | 'replied' | 'archived'
  created_at: string
  updated_at: string
  admin_notes?: string
  replied_at?: string
}

export default function ContactSubmissionsAdmin() {
  const [submissions, setSubmissions] = useState<ContactSubmission[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedSubmission, setSelectedSubmission] = useState<ContactSubmission | null>(null)
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [adminNotes, setAdminNotes] = useState('')

  const fetchSubmissions = async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/admin/contact-submissions')
      if (!response.ok) {
        throw new Error('Failed to fetch submissions')
      }
      const data = await response.json()
      setSubmissions(data.submissions || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setLoading(false)
    }
  }

  const updateSubmissionStatus = async (id: number, status: string, notes?: string) => {
    try {
      const response = await fetch('/api/admin/contact-submissions', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status, admin_notes: notes })
      })
      
      if (!response.ok) {
        throw new Error('Failed to update submission')
      }
      
      // Refresh the submissions list
      fetchSubmissions()
      
      // Update selected submission if it's currently selected
      if (selectedSubmission?.id === id) {
        setSelectedSubmission({ 
          ...selectedSubmission, 
          status: status as any, 
          admin_notes: notes || selectedSubmission.admin_notes 
        })
      }
    } catch (err) {
      alert('Failed to update submission: ' + (err instanceof Error ? err.message : 'Unknown error'))
    }
  }

  useEffect(() => {
    fetchSubmissions()
  }, [])

  const filteredSubmissions = submissions.filter(submission => 
    statusFilter === 'all' || submission.status === statusFilter
  )

  const getStatusBadgeVariant = (status: string) => {
    switch (status) {
      case 'new': return 'default'
      case 'read': return 'secondary'
      case 'replied': return 'outline'
      case 'archived': return 'secondary'
      default: return 'default'
    }
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <RefreshCw className="h-8 w-8 animate-spin" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="container mx-auto px-4 py-8">
        <Card className="border-destructive">
          <CardContent className="pt-6">
            <p className="text-destructive">Error: {error}</p>
            <Button onClick={fetchSubmissions} className="mt-4">
              Try Again
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold">Contact Submissions</h1>
          <p className="text-muted-foreground">
            Manage and respond to contact form submissions
          </p>
        </div>
        <Button onClick={fetchSubmissions} variant="outline">
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Filter Controls */}
      <Card className="mb-6">
        <CardContent className="pt-6">
          <div className="flex gap-4 items-center">
            <Label htmlFor="status-filter">Filter by Status:</Label>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="All statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="new">New</SelectItem>
                <SelectItem value="read">Read</SelectItem>
                <SelectItem value="replied">Replied</SelectItem>
                <SelectItem value="archived">Archived</SelectItem>
              </SelectContent>
            </Select>
            <div className="ml-auto text-sm text-muted-foreground">
              Showing {filteredSubmissions.length} of {submissions.length} submissions
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Submissions List */}
      <div className="space-y-4">
        {filteredSubmissions.length === 0 ? (
          <Card>
            <CardContent className="pt-6 text-center">
              <MessageSquare className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
              <p className="text-muted-foreground">No submissions found</p>
            </CardContent>
          </Card>
        ) : (
          filteredSubmissions.map((submission) => (
            <Card key={submission.id} className="hover:shadow-md transition-shadow">
              <CardContent className="pt-6">
                <div className="flex justify-between items-start mb-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <User className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium">{submission.name}</span>
                      <Mail className="h-4 w-4 text-muted-foreground ml-4" />
                      <span className="text-sm text-muted-foreground">{submission.email}</span>
                    </div>
                    <h3 className="text-lg font-semibold mb-2">{submission.subject}</h3>
                    <p className="text-muted-foreground text-sm line-clamp-2">
                      {submission.message}
                    </p>
                  </div>
                  <div className="flex flex-col gap-2 items-end">
                    <Badge variant={getStatusBadgeVariant(submission.status)}>
                      {submission.status}
                    </Badge>
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Calendar className="h-3 w-3" />
                      {formatDate(submission.created_at)}
                    </div>
                  </div>
                </div>
                
                <div className="flex gap-2">
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => {
                          setSelectedSubmission(submission)
                          setAdminNotes(submission.admin_notes || '')
                          if (submission.status === 'new') {
                            updateSubmissionStatus(submission.id, 'read')
                          }
                        }}
                      >
                        <Eye className="h-4 w-4 mr-2" />
                        View Details
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-2xl">
                      <DialogHeader>
                        <DialogTitle>Contact Submission Details</DialogTitle>
                      </DialogHeader>
                      {selectedSubmission && (
                        <div className="space-y-4">
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <Label>Name</Label>
                              <div className="font-medium">{selectedSubmission.name}</div>
                            </div>
                            <div>
                              <Label>Email</Label>
                              <div className="font-medium">{selectedSubmission.email}</div>
                            </div>
                          </div>
                          <div>
                            <Label>Subject</Label>
                            <div className="font-medium">{selectedSubmission.subject}</div>
                          </div>
                          <div>
                            <Label>Message</Label>
                            <div className="whitespace-pre-wrap bg-muted p-3 rounded-md">
                              {selectedSubmission.message}
                            </div>
                          </div>
                          <div>
                            <Label>Status</Label>
                            <Select 
                              value={selectedSubmission.status} 
                              onValueChange={(value) => updateSubmissionStatus(selectedSubmission.id, value)}
                            >
                              <SelectTrigger className="w-full">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="new">New</SelectItem>
                                <SelectItem value="read">Read</SelectItem>
                                <SelectItem value="replied">Replied</SelectItem>
                                <SelectItem value="archived">Archived</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div>
                            <Label htmlFor="admin-notes">Admin Notes</Label>
                            <Textarea
                              id="admin-notes"
                              value={adminNotes}
                              onChange={(e) => setAdminNotes(e.target.value)}
                              placeholder="Add internal notes about this submission..."
                              className="mt-2"
                            />
                            <Button 
                              size="sm" 
                              className="mt-2"
                              onClick={() => updateSubmissionStatus(selectedSubmission.id, selectedSubmission.status, adminNotes)}
                            >
                              Save Notes
                            </Button>
                          </div>
                          <div className="text-xs text-muted-foreground">
                            <div>Submitted: {formatDate(selectedSubmission.created_at)}</div>
                            <div>Last Updated: {formatDate(selectedSubmission.updated_at)}</div>
                          </div>
                        </div>
                      )}
                    </DialogContent>
                  </Dialog>

                  {submission.status !== 'replied' && (
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => updateSubmissionStatus(submission.id, 'replied')}
                    >
                      <Reply className="h-4 w-4 mr-2" />
                      Mark as Replied
                    </Button>
                  )}

                  {submission.status !== 'archived' && (
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => updateSubmissionStatus(submission.id, 'archived')}
                    >
                      <Archive className="h-4 w-4 mr-2" />
                      Archive
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  )
} 