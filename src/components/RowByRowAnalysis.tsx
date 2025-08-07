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

  useEffect(() => {
    parseDocumentIntoRows();
  }, [documentText]);

  const parseDocumentIntoRows = () => {
    const lines = documentText.split('\n').filter(line => line.trim() !== '');
    const parsedRows: DocumentRow[] = lines.map((line, index) => ({
      id: `row-${index}`,
      rowNumber: index + 1,
      content: line.trim(),
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
    setOngoingOwnership(prev => {
      const updated = { ...prev };
      
      // Apply ownership changes based on analysis
      if (analysis.ownershipChange && analysis.grantees) {
        // Handle ownership transfer
        analysis.grantees.forEach((grantee: string) => {
          const existingOwnerIndex = updated.owners.findIndex(o => 
            o.name.toLowerCase().includes(grantee.toLowerCase()) ||
            grantee.toLowerCase().includes(o.name.toLowerCase())
          );
          
          if (existingOwnerIndex >= 0) {
            // Update existing owner
            updated.owners[existingOwnerIndex] = {
              ...updated.owners[existingOwnerIndex],
              percentage: analysis.percentageChange || updated.owners[existingOwnerIndex].percentage,
              acquisitionDocument: analysis.documentNumber || updated.owners[existingOwnerIndex].acquisitionDocument
            };
          } else {
            // Add new owner
            updated.owners.push({
              name: grantee,
              percentage: analysis.percentageChange || 0,
              netAcres: (analysis.percentageChange || 0) * totalAcres / 100,
              acquisitionDocument: analysis.documentNumber,
              currentLeaseStatus: 'unknown'
            });
          }
        });
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

      updated.totalPercentage = updated.owners.reduce((sum, owner) => sum + owner.percentage, 0);
      updated.lastUpdatedRow = currentRowIndex;
      
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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Current Row Analysis */}
        <Card>
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
          <CardContent className="space-y-4">
            {/* Row Content */}
            <div>
              <div className="text-sm font-medium text-muted-foreground mb-2">
                Row {currentRow?.rowNumber} Content:
              </div>
              <div className="p-3 bg-muted rounded text-sm font-mono">
                {currentRow?.content}
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
                    <div className="text-sm">{currentRow.analysis.grantees.join(', ')}</div>
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
        <Card>
          <CardHeader>
            <CardTitle>Ongoing Ownership Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
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

              <div>
                <div className="text-sm font-medium mb-2">Current Owners:</div>
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {ongoingOwnership.owners.length === 0 ? (
                    <div className="text-sm text-muted-foreground text-center py-4">
                      No owners identified yet
                    </div>
                  ) : (
                    ongoingOwnership.owners.map((owner, index) => (
                      <div key={index} className="p-3 bg-muted rounded text-sm">
                        <div className="font-medium">{owner.name}</div>
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

      {/* All Rows Overview */}
      <Card>
        <CardHeader>
          <CardTitle>All Rows Overview</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 max-h-40 overflow-y-auto">
            {rows.map((row, index) => (
              <div
                key={row.id}
                className={`p-2 rounded text-sm cursor-pointer transition-colors ${
                  index === currentRowIndex 
                    ? 'bg-primary text-primary-foreground' 
                    : row.status === 'approved' 
                      ? 'bg-green-100 text-green-800'
                      : row.status === 'analyzed' || row.status === 'corrected'
                        ? 'bg-blue-100 text-blue-800'
                        : 'bg-muted'
                }`}
                onClick={() => setCurrentRowIndex(index)}
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium">Row {row.rowNumber}</span>
                  {row.status === 'approved' && <CheckCircle className="w-4 h-4" />}
                  {row.status === 'analyzed' && <Eye className="w-4 h-4" />}
                  {row.status === 'corrected' && <Edit className="w-4 h-4" />}
                  {row.status === 'pending' && <AlertCircle className="w-4 h-4" />}
                </div>
                <div className="text-xs opacity-75 truncate">
                  {row.content.substring(0, 50)}...
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Cancel Button */}
      <div className="flex justify-center">
        <Button variant="outline" onClick={onCancel}>
          Cancel Analysis
        </Button>
      </div>
    </div>
  );
};