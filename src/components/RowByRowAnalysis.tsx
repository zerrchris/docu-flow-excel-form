import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CheckCircle, XCircle, AlertCircle, ArrowRight, ArrowLeft, Eye, Edit, Save, X } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

export interface DocumentRow {
  id: string;
  rowNumber: number;
  content: string;
  parsed: boolean;
  analysis?: {
    documentType?: string;
    documentNumber?: string;
    recordingReference?: string;
    grantors?: string[];
    grantees?: string[];
    ownershipChange?: boolean;
    leaseStatus?: 'active' | 'expired' | 'none';
    percentageChange?: number;
    description?: string;
    effectiveDate?: string;
    acreage?: number;
  };
  userCorrection?: any;
  status: 'pending' | 'analyzing' | 'analyzed' | 'corrected' | 'approved';
}

export interface OngoingOwnership {
  owners: Array<{
    name: string;
    percentage: number;
    netAcres: number;
    acquisitionDocument?: string;
    rightType?: 'surface' | 'mineral' | 'both';
    currentLeaseStatus: 'leased' | 'open' | 'expired_hbp' | 'unknown';
    leaseDetails?: {
      lessor: string;
      lessee: string;
      dated: string;
      term: string;
      expiration: string;
      documentNumber: string;
      royalty?: string;
      clauses?: string[];
    };
  }>;
  totalPercentage: number;
  totalAcres: number;
  lastUpdatedRow: number;
}

interface RowByRowAnalysisProps {
  documentText: string;
  prospect: string;
  totalAcres: number;
  onComplete: (finalOwnership: OngoingOwnership) => void;
  onCancel: () => void;
}

export const RowByRowAnalysis: React.FC<RowByRowAnalysisProps> = ({
  documentText,
  prospect,
  totalAcres,
  onComplete,
  onCancel
}) => {
  // Create a unique storage key for this analysis session
  const storageKey = `row-analysis-${prospect}-${documentText.slice(0, 50).replace(/\W/g, '')}`;
  
  const [rows, setRows] = useState<DocumentRow[]>([]);
  const [currentRowIndex, setCurrentRowIndex] = useState(0);
  const [ongoingOwnership, setOngoingOwnership] = useState<OngoingOwnership>({
    owners: [],
    totalPercentage: 0,
    totalAcres: totalAcres,
    lastUpdatedRow: -1
  });
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [editingRow, setEditingRow] = useState<string | null>(null);
  const [editedAnalysis, setEditedAnalysis] = useState<any>(null);
  const { toast } = useToast();

  // Load saved progress on mount
  useEffect(() => {
    const savedProgress = localStorage.getItem(storageKey);
    if (savedProgress) {
      try {
        const { rows: savedRows, currentRowIndex: savedIndex, ongoingOwnership: savedOwnership } = JSON.parse(savedProgress);
        if (savedRows && savedRows.length > 0) {
          setRows(savedRows);
          setCurrentRowIndex(savedIndex || 0);
          setOngoingOwnership(savedOwnership || {
            owners: [],
            totalPercentage: 0,
            totalAcres: totalAcres,
            lastUpdatedRow: -1
          });
          toast({
            title: "Progress Restored",
            description: "Your previous analysis progress has been restored.",
          });
          return; // Don't parse document again if we have saved progress
        }
      } catch (error) {
        console.error('Failed to restore progress:', error);
      }
    }
    parseDocumentIntoRows();
  }, [documentText, storageKey]);

  // Save progress whenever state changes
  useEffect(() => {
    if (rows.length > 0) {
      const progressData = {
        rows,
        currentRowIndex,
        ongoingOwnership,
        timestamp: Date.now()
      };
      localStorage.setItem(storageKey, JSON.stringify(progressData));
    }
  }, [rows, currentRowIndex, ongoingOwnership, storageKey]);


  const cleanRowContent = (content: string): string => {
    // Replace ||NEWLINE|| markers with actual line breaks
    let cleaned = content.replace(/\|\|NEWLINE\|\|/g, '\n');
    
    // Remove carriage returns
    cleaned = cleaned.replace(/\r/g, '');
    
    // Clean up multiple consecutive spaces
    cleaned = cleaned.replace(/\s+/g, ' ');
    
    // If it looks like pipe-separated data, format it better
    if (cleaned.includes(' | ')) {
      const parts = cleaned.split(' | ').map(part => part.trim()).filter(part => part !== '');
      if (parts.length > 1) {
        // Format as structured data
        return parts.join('\n• ');
      }
    }
    
    return cleaned.trim();
  };

  const parseDocumentIntoRows = () => {
    const lines = documentText.split('\n').filter(line => line.trim() !== '');
    const parsedRows: DocumentRow[] = lines.map((line, index) => ({
      id: `row-${index}`,
      rowNumber: index + 1,
      content: cleanRowContent(line.trim()),
      parsed: false,
      status: 'pending'
    }));
    setRows(parsedRows);
  };

  const analyzeCurrentRow = async () => {
    if (currentRowIndex >= rows.length) return;
    
    const currentRow = rows[currentRowIndex];
    setIsAnalyzing(true);
    
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      const response = await supabase.functions.invoke('analyze-row-ownership', {
        body: {
          rowContent: currentRow.content,
          rowNumber: currentRow.rowNumber,
          prospect,
          totalAcres,
          currentOwnership: ongoingOwnership
        },
        headers: {
          Authorization: `Bearer ${session?.access_token}`,
        },
      });

      if (response.error) {
        throw new Error(response.error.message);
      }

      const analysis = response.data;
      
      // Update the row with analysis
      const updatedRows = [...rows];
      updatedRows[currentRowIndex] = {
        ...currentRow,
        analysis,
        status: 'analyzed',
        parsed: true
      };
      setRows(updatedRows);

      // Update ongoing ownership if there's a change
      if (analysis.ownershipChange) {
        updateOngoingOwnership(analysis);
      }

      toast({
        title: "Row Analyzed",
        description: `Row ${currentRow.rowNumber} has been analyzed`,
      });
    } catch (error) {
      console.error('Error analyzing row:', error);
      toast({
        title: "Analysis Error",
        description: "Failed to analyze the current row",
        variant: "destructive"
      });
    } finally {
      setIsAnalyzing(false);
    }
  };

  const updateOngoingOwnership = (analysis: any) => {
    console.log('Updating ownership with analysis:', analysis);
    console.log('Current total acres:', totalAcres);
    
    setOngoingOwnership(prev => {
      const updated = { ...prev };
      
      // Handle patent documents - original government grants should be 100%
      if (analysis.documentType === 'Patent' && analysis.grantees && analysis.grantees.length > 0) {
        const patentee = analysis.grantees[0];
        console.log('Processing patent for:', patentee);
        
        // For patents, grant 100% ownership to the patentee
        const existingOwnerIndex = updated.owners.findIndex(o => 
          o.name.toLowerCase().includes(patentee.toLowerCase()) ||
          patentee.toLowerCase().includes(o.name.toLowerCase())
        );
        
        // Use a default of 80 acres if totalAcres is 0 (common section size for E2SE4)
        const effectiveAcres = totalAcres > 0 ? totalAcres : 80;
        
        if (existingOwnerIndex >= 0) {
          // Update existing owner to 100%
          updated.owners[existingOwnerIndex] = {
            ...updated.owners[existingOwnerIndex],
            percentage: 100,
            netAcres: effectiveAcres,
            acquisitionDocument: analysis.recordingReference || analysis.documentNumber
          };
          console.log('Updated existing owner:', updated.owners[existingOwnerIndex]);
        } else {
          // Add new owner with 100%
          const newOwner = {
            name: patentee,
            percentage: 100,
            netAcres: effectiveAcres,
            acquisitionDocument: analysis.recordingReference || analysis.documentNumber,
            currentLeaseStatus: 'unknown' as const
          };
          updated.owners.push(newOwner);
          console.log('Added new owner:', newOwner);
        }
        
        // Update total acres if it was 0
        if (updated.totalAcres === 0) {
          updated.totalAcres = effectiveAcres;
        }
      }
      // Handle other ownership transfers (deeds, etc.)
      else if (analysis.ownershipChange && analysis.grantees) {
        console.log('Processing ownership change for other deeds:', analysis);
        console.log('Number of grantees found:', analysis.grantees?.length);
        console.log('Grantees list:', analysis.grantees);
        
        // For mineral deeds, handle differently than surface deeds
        const isMineralDeed = analysis.documentType === 'MD';
        
        if (isMineralDeed) {
          console.log('Processing mineral deed - grantor keeps surface, minerals split among grantees');
          
          // For mineral deeds: grantor keeps surface rights, minerals split among grantees
          const grantorName = analysis.grantors?.[0];
          if (grantorName) {
            // Keep grantor with surface rights (100%)
            const grantorIndex = updated.owners.findIndex(o => 
              o.name.toLowerCase().includes(grantorName.toLowerCase()) ||
              grantorName.toLowerCase().includes(o.name.toLowerCase())
            );
            
            if (grantorIndex >= 0) {
              // Update grantor to show they retain surface rights
              updated.owners[grantorIndex] = {
                ...updated.owners[grantorIndex],
                rightType: 'surface',
                acquisitionDocument: analysis.recordingReference || analysis.documentNumber || updated.owners[grantorIndex].acquisitionDocument
              };
            }
          }
          
          // Add all grantees with equal mineral rights split
          const numberOfGrantees = analysis.grantees.length;
          const mineralPercentagePerGrantee = 100 / numberOfGrantees;
          const effectiveAcres = totalAcres > 0 ? totalAcres : 80;
          const netAcres = (mineralPercentagePerGrantee / 100) * effectiveAcres;
          
          console.log(`Mineral deed: splitting 100% minerals among ${numberOfGrantees} grantees = ${mineralPercentagePerGrantee}% each`);
          
          analysis.grantees.forEach((grantee: string, index: number) => {
            console.log(`Processing grantee ${index + 1}: ${grantee}`);
            
            const existingOwnerIndex = updated.owners.findIndex(o => 
              o.name.toLowerCase().trim() === grantee.toLowerCase().trim()
            );
            
            if (existingOwnerIndex >= 0) {
              // Update existing owner
              updated.owners[existingOwnerIndex] = {
                ...updated.owners[existingOwnerIndex],
                percentage: updated.owners[existingOwnerIndex].percentage + mineralPercentagePerGrantee,
                netAcres: updated.owners[existingOwnerIndex].netAcres + netAcres,
                rightType: 'mineral',
                acquisitionDocument: analysis.recordingReference || analysis.documentNumber || updated.owners[existingOwnerIndex].acquisitionDocument
              };
              console.log(`Updated existing mineral owner ${grantee} to ${updated.owners[existingOwnerIndex].percentage}%`);
            } else {
              // Add new mineral owner
              const newOwner = {
                name: grantee,
                percentage: mineralPercentagePerGrantee,
                netAcres: netAcres,
                rightType: 'mineral' as const,
                acquisitionDocument: analysis.recordingReference || analysis.documentNumber,
                currentLeaseStatus: 'unknown' as const
              };
              updated.owners.push(newOwner);
              console.log(`Added new mineral owner ${grantee} with ${mineralPercentagePerGrantee}%`);
            }
          });
        } else {
        // First, find the grantor's current ownership to determine what's being transferred
        let ownershipToTransfer = 100; // Default assumption
        let grantorIndex = -1;
        
        if (analysis.grantors && analysis.grantors.length > 0) {
          const grantorName = analysis.grantors[0];
          grantorIndex = updated.owners.findIndex(o => 
            o.name.toLowerCase().includes(grantorName.toLowerCase()) ||
            grantorName.toLowerCase().includes(o.name.toLowerCase())
          );
          
          if (grantorIndex >= 0) {
            ownershipToTransfer = updated.owners[grantorIndex].percentage;
            console.log(`Found grantor ${grantorName} with ${ownershipToTransfer}% ownership`);
            // Remove the grantor since they're transferring their interest
            updated.owners.splice(grantorIndex, 1);
          }
        }
        
        // Determine how to split the ownership among grantees
        const numberOfGrantees = analysis.grantees.length;
        let ownershipPerGrantee = ownershipToTransfer;
        
        // Check if the description indicates even split
        if (analysis.description && analysis.description.toLowerCase().includes('split evenly') && numberOfGrantees > 1) {
          ownershipPerGrantee = ownershipToTransfer / numberOfGrantees;
          console.log(`Splitting ${ownershipToTransfer}% evenly among ${numberOfGrantees} grantees = ${ownershipPerGrantee}% each`);
        } else if (analysis.percentageChange) {
          ownershipPerGrantee = analysis.percentageChange;
        } else if (numberOfGrantees > 1 && !analysis.percentageChange) {
          // If multiple grantees but no explicit split mentioned, assume equal division
          ownershipPerGrantee = ownershipToTransfer / numberOfGrantees;
          console.log(`Multiple grantees, assuming equal split: ${ownershipPerGrantee}% each`);
        }
        
        // Add each grantee with their portion
        analysis.grantees.forEach((grantee: string) => {
          const existingOwnerIndex = updated.owners.findIndex(o => 
            o.name.toLowerCase().includes(grantee.toLowerCase()) ||
            grantee.toLowerCase().includes(o.name.toLowerCase())
          );
          
          const effectiveAcres = totalAcres > 0 ? totalAcres : 80;
          const netAcres = (ownershipPerGrantee / 100) * effectiveAcres;
          
          if (existingOwnerIndex >= 0) {
            // Update existing owner (add to their existing percentage)
            updated.owners[existingOwnerIndex] = {
              ...updated.owners[existingOwnerIndex],
              percentage: updated.owners[existingOwnerIndex].percentage + ownershipPerGrantee,
              netAcres: updated.owners[existingOwnerIndex].netAcres + netAcres,
              acquisitionDocument: analysis.recordingReference || analysis.documentNumber || updated.owners[existingOwnerIndex].acquisitionDocument
            };
            console.log(`Updated existing owner ${grantee} to ${updated.owners[existingOwnerIndex].percentage}%`);
          } else {
            // Add new owner
            const newOwner = {
              name: grantee,
              percentage: ownershipPerGrantee,
              netAcres: netAcres,
              acquisitionDocument: analysis.recordingReference || analysis.documentNumber,
              currentLeaseStatus: 'unknown' as const
            };
            updated.owners.push(newOwner);
            console.log(`Added new owner ${grantee} with ${ownershipPerGrantee}%`);
          }
        });
        }
      }

      // Handle lease information
      if (analysis.leaseStatus && analysis.leaseStatus !== 'none') {
        const ownerName = analysis.grantors?.[0] || analysis.grantees?.[0];
        if (ownerName) {
          const ownerIndex = updated.owners.findIndex(o => 
            o.name.toLowerCase().includes(ownerName.toLowerCase()) ||
            ownerName.toLowerCase().includes(o.name.toLowerCase())
          );
          
          if (ownerIndex >= 0) {
            updated.owners[ownerIndex] = {
              ...updated.owners[ownerIndex],
              currentLeaseStatus: analysis.leaseStatus === 'active' ? 'leased' : 
                                 analysis.leaseStatus === 'expired' ? 'expired_hbp' : 'open',
              leaseDetails: analysis.leaseDetails
            };
          }
        }
      }

      // Calculate total percentages separately for surface and mineral rights
      const surfaceOwners = updated.owners.filter(o => o.rightType === 'surface' || o.rightType === 'both');
      const mineralOwners = updated.owners.filter(o => o.rightType === 'mineral' || o.rightType === 'both');
      const surfacePercentage = surfaceOwners.reduce((sum, owner) => sum + owner.percentage, 0);
      const mineralPercentage = mineralOwners.reduce((sum, owner) => sum + owner.percentage, 0);
      
      // For display purposes, show the higher of the two percentages or 100% if both exist
      updated.totalPercentage = Math.max(surfacePercentage, mineralPercentage);
      updated.lastUpdatedRow = currentRowIndex;
      
      console.log('Final updated ownership:', updated);
      
      return updated;
    });
  };

  const approveCurrentRow = () => {
    const updatedRows = [...rows];
    updatedRows[currentRowIndex] = {
      ...updatedRows[currentRowIndex],
      status: 'approved'
    };
    setRows(updatedRows);
    
    if (currentRowIndex < rows.length - 1) {
      setCurrentRowIndex(currentRowIndex + 1);
    } else {
      // Analysis complete
      onComplete(ongoingOwnership);
    }
  };

  const editRowAnalysis = () => {
    const currentRow = rows[currentRowIndex];
    setEditingRow(currentRow.id);
    setEditedAnalysis({ ...currentRow.analysis });
  };

  const saveRowEdit = () => {
    const updatedRows = [...rows];
    updatedRows[currentRowIndex] = {
      ...updatedRows[currentRowIndex],
      analysis: editedAnalysis,
      userCorrection: editedAnalysis,
      status: 'corrected'
    };
    setRows(updatedRows);
    
    // Update ownership based on corrected analysis
    if (editedAnalysis.ownershipChange) {
      updateOngoingOwnership(editedAnalysis);
    }
    
    setEditingRow(null);
    setEditedAnalysis(null);
  };

  const cancelEdit = () => {
    setEditingRow(null);
    setEditedAnalysis(null);
  };

  const goToPreviousRow = () => {
    if (currentRowIndex > 0) {
      setCurrentRowIndex(currentRowIndex - 1);
    }
  };

  const goToNextRow = () => {
    if (currentRowIndex < rows.length - 1) {
      setCurrentRowIndex(currentRowIndex + 1);
    }
  };

  const clearProgress = () => {
    localStorage.removeItem(storageKey);
    parseDocumentIntoRows();
    setCurrentRowIndex(0);
    setOngoingOwnership({
      owners: [],
      totalPercentage: 0,
      totalAcres: totalAcres,
      lastUpdatedRow: -1
    });
    toast({
      title: "Progress Cleared",
      description: "Analysis has been reset to start fresh.",
    });
  };

  const currentRow = rows[currentRowIndex];
  const isLastRow = currentRowIndex === rows.length - 1;
  const isFirstRow = currentRowIndex === 0;

  return (
    <div className="space-y-6">
      {/* Progress Header */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Row-by-Row Analysis: {prospect}</span>
            <div className="flex items-center gap-4">
              <Button
                variant="outline"
                size="sm"
                onClick={clearProgress}
                className="text-xs"
              >
                Start Fresh
              </Button>
              <Badge variant="outline">
                Row {currentRowIndex + 1} of {rows.length}
              </Badge>
              <div className="text-sm text-muted-foreground">
                Progress: {Math.round(((currentRowIndex + 1) / rows.length) * 100)}%
              </div>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="w-full bg-muted rounded-full h-2">
            <div 
              className="bg-primary h-2 rounded-full transition-all duration-300"
              style={{ width: `${((currentRowIndex + 1) / rows.length) * 100}%` }}
            />
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 h-[calc(100vh-500px)] min-h-[400px]">
        {/* Current Row Analysis */}
        <Card className="flex flex-col h-full">
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>Current Row Analysis</span>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={goToPreviousRow}
                  disabled={isFirstRow}
                >
                  <ArrowLeft className="w-4 h-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={goToNextRow}
                  disabled={isLastRow}
                >
                  <ArrowRight className="w-4 h-4" />
                </Button>
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 flex-1 overflow-y-auto">
            {/* Row Content */}
            <div>
              <div className="text-sm font-medium text-muted-foreground mb-2">
                Row {currentRow?.rowNumber} Content:
              </div>
              <div className="p-3 bg-muted rounded text-sm">
                <pre className="whitespace-pre-wrap font-sans leading-relaxed">
                  {currentRow?.content}
                </pre>
              </div>
            </div>

            {/* Analysis Results */}
            {currentRow?.analysis && !editingRow && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-medium">Analysis Results:</div>
                  <Button variant="outline" size="sm" onClick={editRowAnalysis}>
                    <Edit className="w-4 h-4 mr-1" />
                    Edit
                  </Button>
                </div>
                
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <span className="font-medium">Document Type:</span>
                    <div>{currentRow.analysis.documentType || 'N/A'}</div>
                  </div>
                  <div>
                    <span className="font-medium">Document #:</span>
                    <div>{currentRow.analysis.documentNumber || 'N/A'}</div>
                  </div>
                  <div>
                    <span className="font-medium">Ownership Change:</span>
                    <div>
                      <Badge variant={currentRow.analysis.ownershipChange ? "default" : "secondary"}>
                        {currentRow.analysis.ownershipChange ? "Yes" : "No"}
                      </Badge>
                    </div>
                  </div>
                  <div>
                    <span className="font-medium">Lease Status:</span>
                    <div>
                      <Badge variant="outline">
                        {currentRow.analysis.leaseStatus || 'None'}
                      </Badge>
                    </div>
                  </div>
                </div>

                {currentRow.analysis.grantors && currentRow.analysis.grantors.length > 0 && (
                  <div>
                    <span className="font-medium text-sm">Grantors:</span>
                    <div className="text-sm">{currentRow.analysis.grantors.join(', ')}</div>
                  </div>
                )}

                {currentRow.analysis.grantees && currentRow.analysis.grantees.length > 0 && (
                  <div>
                    <span className="font-medium text-sm">Grantees:</span>
                    <div className="text-sm">
                      {currentRow.analysis.grantees.map((grantee, index) => 
                        `${index + 1}. ${grantee}`
                      ).join(', ')}
                    </div>
                  </div>
                )}

                {currentRow.analysis.description && (
                  <div>
                    <span className="font-medium text-sm">Description:</span>
                    <div className="text-sm">{currentRow.analysis.description}</div>
                  </div>
                )}
              </div>
            )}

            {/* Edit Form */}
            {editingRow === currentRow?.id && editedAnalysis && (
              <div className="space-y-3">
                <div className="text-sm font-medium">Edit Analysis:</div>
                
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-sm font-medium">Document Type:</label>
                    <Input
                      value={editedAnalysis.documentType || ''}
                      onChange={(e) => setEditedAnalysis({...editedAnalysis, documentType: e.target.value})}
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium">Document Number:</label>
                    <Input
                      value={editedAnalysis.documentNumber || ''}
                      onChange={(e) => setEditedAnalysis({...editedAnalysis, documentNumber: e.target.value})}
                    />
                  </div>
                </div>

                <div>
                  <label className="text-sm font-medium">Ownership Change:</label>
                  <Select
                    value={editedAnalysis.ownershipChange ? "true" : "false"}
                    onValueChange={(value) => setEditedAnalysis({...editedAnalysis, ownershipChange: value === "true"})}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="true">Yes</SelectItem>
                      <SelectItem value="false">No</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <label className="text-sm font-medium">Description:</label>
                  <Textarea
                    value={editedAnalysis.description || ''}
                    onChange={(e) => setEditedAnalysis({...editedAnalysis, description: e.target.value})}
                    rows={3}
                  />
                </div>

                <div className="flex gap-2">
                  <Button size="sm" onClick={saveRowEdit}>
                    <Save className="w-4 h-4 mr-1" />
                    Save
                  </Button>
                  <Button variant="outline" size="sm" onClick={cancelEdit}>
                    <X className="w-4 h-4 mr-1" />
                    Cancel
                  </Button>
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex gap-2 pt-4 border-t">
              {!currentRow?.analysis ? (
                <Button 
                  onClick={analyzeCurrentRow}
                  disabled={isAnalyzing}
                  className="flex-1"
                >
                  {isAnalyzing ? 'Analyzing...' : 'Analyze Row'}
                </Button>
              ) : (
                <>
                  <Button 
                    onClick={approveCurrentRow}
                    className="flex-1"
                  >
                    <CheckCircle className="w-4 h-4 mr-2" />
                    {isLastRow ? 'Complete Analysis' : 'Approve & Next'}
                  </Button>
                  <Button 
                    variant="outline"
                    onClick={analyzeCurrentRow}
                    disabled={isAnalyzing}
                  >
                    Re-analyze
                  </Button>
                </>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Ongoing Ownership Summary */}
        <Card className="flex flex-col h-full">
          <CardHeader>
            <CardTitle>Ongoing Ownership Summary</CardTitle>
          </CardHeader>
          <CardContent className="flex-1 overflow-y-auto">
            <div className="h-full flex flex-col space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="font-medium">Total Percentage:</span>
                  <div className="text-lg font-bold">{ongoingOwnership.totalPercentage.toFixed(6)}%</div>
                </div>
                <div>
                  <span className="font-medium">Total Acres:</span>
                  <div className="text-lg font-bold">{ongoingOwnership.totalAcres}</div>
                </div>
              </div>

              <div className="flex-1 flex flex-col">
                <div className="text-sm font-medium mb-2">Current Owners:</div>
                <div className="flex-1 overflow-y-auto space-y-2 min-h-0">
                  {ongoingOwnership.owners.length === 0 ? (
                    <div className="text-sm text-muted-foreground text-center py-4">
                      No owners identified yet
                    </div>
                  ) : (
                     ongoingOwnership.owners.map((owner, index) => (
                       <div key={index} className="p-3 bg-muted rounded text-sm">
                         <div className="font-medium flex items-center gap-2">
                           {owner.name}
                           {owner.rightType && (
                             <Badge variant="outline" className="text-xs">
                               {owner.rightType}
                             </Badge>
                           )}
                         </div>
                         <div className="flex justify-between text-xs text-muted-foreground">
                           <span>{owner.percentage.toFixed(6)}%</span>
                           <span>{owner.netAcres.toFixed(2)} acres</span>
                         </div>
                         <div className="flex items-center gap-2 mt-1">
                           <Badge 
                             variant={
                               owner.currentLeaseStatus === 'leased' ? 'default' :
                               owner.currentLeaseStatus === 'open' ? 'secondary' :
                               owner.currentLeaseStatus === 'expired_hbp' ? 'destructive' : 'outline'
                             }
                             className="text-xs"
                           >
                             {owner.currentLeaseStatus}
                           </Badge>
                           {owner.acquisitionDocument && (
                             <span className="text-xs text-muted-foreground">
                               Doc: {owner.acquisitionDocument}
                             </span>
                           )}
                         </div>
                       </div>
                     ))
                  )}
                </div>
              </div>

              <div className="text-xs text-muted-foreground">
                Last updated: Row {ongoingOwnership.lastUpdatedRow + 1}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* All Rows Overview - Separate Section at Bottom */}
      <Card className="mt-6">
        <CardHeader>
          <CardTitle>All Rows Overview</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b">
                  <th className="text-left p-2 w-16">Row</th>
                  <th className="text-left p-2 w-24">Status</th>
                  <th className="text-left p-2">Document Type</th>
                  <th className="text-left p-2">Recording</th>
                  <th className="text-left p-2">Date</th>
                  <th className="text-left p-2">Grantor</th>
                  <th className="text-left p-2">Grantee(s)</th>
                  <th className="text-left p-2">Description</th>
                  <th className="text-left p-2 w-20">Action</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => (
                  <tr 
                    key={row.id}
                    className={`border-b hover:bg-muted/50 cursor-pointer ${
                      index === currentRowIndex ? 'bg-primary/10' : ''
                    }`}
                    onClick={() => setCurrentRowIndex(index)}
                  >
                    <td className="p-2 font-medium">{row.rowNumber}</td>
                    <td className="p-2">
                      <div className="flex items-center gap-1">
                        {row.status === 'approved' && (
                          <>
                            <CheckCircle className="w-4 h-4 text-green-600" />
                            <span className="text-green-600 text-xs">Approved</span>
                          </>
                        )}
                        {row.status === 'analyzed' && (
                          <>
                            <Eye className="w-4 h-4 text-blue-600" />
                            <span className="text-blue-600 text-xs">Analyzed</span>
                          </>
                        )}
                        {row.status === 'corrected' && (
                          <>
                            <Edit className="w-4 h-4 text-orange-600" />
                            <span className="text-orange-600 text-xs">Corrected</span>
                          </>
                        )}
                        {row.status === 'pending' && (
                          <>
                            <AlertCircle className="w-4 h-4 text-gray-400" />
                            <span className="text-gray-400 text-xs">Pending</span>
                          </>
                        )}
                      </div>
                    </td>
                    <td className="p-2">{row.analysis?.documentType || '-'}</td>
                    <td className="p-2 text-xs">{row.analysis?.recordingReference || '-'}</td>
                    <td className="p-2 text-xs">{row.analysis?.effectiveDate || '-'}</td>
                    <td className="p-2 text-xs">{row.analysis?.grantors?.join(', ') || '-'}</td>
                    <td className="p-2 text-xs max-w-48">
                      {row.analysis?.grantees ? (
                        <div className="truncate" title={row.analysis.grantees.join(', ')}>
                          {row.analysis.grantees.length > 2 
                            ? `${row.analysis.grantees.slice(0, 2).join(', ')} +${row.analysis.grantees.length - 2} more`
                            : row.analysis.grantees.join(', ')
                          }
                        </div>
                      ) : '-'}
                    </td>
                    <td className="p-2 text-xs max-w-64">
                      <div className="truncate" title={row.analysis?.description || row.content}>
                        {row.analysis?.description || cleanRowContent(row.content.substring(0, 60)) + '...'}
                      </div>
                    </td>
                    <td className="p-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          setCurrentRowIndex(index);
                        }}
                        className="h-6 px-2 text-xs"
                      >
                        View
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Cancel Button */}
      <div className="flex justify-center mt-6">
        <Button variant="outline" onClick={onCancel}>
          Cancel Analysis
        </Button>
      </div>
    </div>
  );
};