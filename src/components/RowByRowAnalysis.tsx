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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';

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

export interface PendingTransfer {
  grantorName: string;
  granteeName: string;
  surfacePercentage: number;
  mineralPercentage: number;
  documentReference: string;
  rowIndex: number;
  transferType: 'full' | 'surface_only' | 'mineral_only';
  reservedMineralPercentage?: number;
}

export interface LandParcel {
  description: string;
  acres: number;
  section?: string;
  township?: string;
  range?: string;
  quarter?: string;
}

export interface OngoingOwnership {
  owners: Array<{
    name: string;
    surfacePercentage: number;
    mineralPercentage: number;
    netSurfaceAcres: number;
    netMineralAcres: number;
    acquisitionDocument?: string;
    currentLeaseStatus: 'leased' | 'open' | 'expired_hbp' | 'unknown';
    isBeingTransferred?: boolean; // Flag to show this owner is being transferred
    landParcels?: LandParcel[]; // Track specific land parcels for this owner
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
  pendingTransfers: PendingTransfer[];
  totalSurfacePercentage: number;
  totalMineralPercentage: number;
  totalAcres: number;
  landParcels: LandParcel[]; // Track all land parcels in the analysis
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
    pendingTransfers: [],
    totalSurfacePercentage: 0,
    totalMineralPercentage: 0,
    totalAcres: totalAcres || 0,
    landParcels: [],
    lastUpdatedRow: -1
  });
  const [previousOwnership, setPreviousOwnership] = useState<OngoingOwnership>({
    owners: [],
    pendingTransfers: [],
    totalSurfacePercentage: 0,
    totalMineralPercentage: 0,
    totalAcres: totalAcres,
    landParcels: [],
    lastUpdatedRow: -1
  });
  // Store ownership state at each row for navigation
  const [ownershipHistory, setOwnershipHistory] = useState<Record<number, OngoingOwnership>>({});
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [editingRow, setEditingRow] = useState<string | null>(null);
  const [editedAnalysis, setEditedAnalysis] = useState<any>(null);
  const [pendingNameMatches, setPendingNameMatches] = useState<any>(null);
  const [individualMatchSelections, setIndividualMatchSelections] = useState<Record<string, boolean>>({});
  const { toast } = useToast();

  // Load saved progress on mount
  useEffect(() => {
    const savedProgress = localStorage.getItem(storageKey);
    if (savedProgress) {
      try {
        const { 
          rows: savedRows, 
          currentRowIndex: savedIndex, 
          ongoingOwnership: savedOwnership,
          ownershipHistory: savedHistory 
        } = JSON.parse(savedProgress);
        if (savedRows && savedRows.length > 0) {
          setRows(savedRows);
          setCurrentRowIndex(savedIndex || 0);
          setOngoingOwnership(savedOwnership ? {
            ...savedOwnership,
            pendingTransfers: savedOwnership.pendingTransfers || []
          } : {
            owners: [],
            pendingTransfers: [],
            totalSurfacePercentage: 0,
            totalMineralPercentage: 0,
            totalAcres: totalAcres || 0,
            lastUpdatedRow: -1
          });
          setOwnershipHistory(savedHistory || {});
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
        ownershipHistory,
        timestamp: Date.now()
      };
      localStorage.setItem(storageKey, JSON.stringify(progressData));
    }
  }, [rows, currentRowIndex, ongoingOwnership, ownershipHistory, storageKey]);

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

      // Check for potential name matches before updating ownership
      if (analysis.ownershipChange) {
        const nameMatches = checkForNameMatches(analysis);
        if (nameMatches) {
          setPendingNameMatches({ analysis, matches: nameMatches });
          return; // Don't update ownership yet, wait for user confirmation
        }
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

  // Name matching functions
  const getNameVariations = (name: string): string[] => {
    const variations = [];
    const cleaned = name.trim().toLowerCase();
    
    // Original name
    variations.push(cleaned);
    
    // Remove middle names/initials
    const parts = cleaned.split(/\s+/);
    if (parts.length > 2) {
      variations.push(`${parts[0]} ${parts[parts.length - 1]}`);
    }
    
    // Common abbreviations and variations
    const commonVariations: Record<string, string[]> = {
      'william': ['bill', 'billy', 'will'],
      'robert': ['bob', 'bobby', 'rob'],
      'james': ['jim', 'jimmy'],
      'john': ['jack', 'johnny'],
      'elizabeth': ['beth', 'liz', 'betty'],
      'margaret': ['maggie', 'peggy', 'meg'],
      'catherine': ['kate', 'cathy', 'katie'],
      'patricia': ['pat', 'patty', 'tricia'],
      'michael': ['mike', 'mick'],
      'richard': ['rick', 'dick', 'rich'],
      'joseph': ['joe', 'joey'],
      'charles': ['chuck', 'charlie'],
      'edward': ['ed', 'eddie', 'ted'],
      'thomas': ['tom', 'tommy']
    };
    
    parts.forEach(part => {
      if (commonVariations[part]) {
        commonVariations[part].forEach(variation => {
          const newName = cleaned.replace(part, variation);
          variations.push(newName);
        });
      }
    });
    
    return [...new Set(variations)];
  };

  const findPotentialMatches = (newName: string, existingOwners: any[]): any[] => {
    const newNameVariations = getNameVariations(newName);
    const matches = [];
    
    for (const owner of existingOwners) {
      const ownerVariations = getNameVariations(owner.name);
      
      // Check for exact matches or variations
      for (const newVar of newNameVariations) {
        for (const ownerVar of ownerVariations) {
          // Exact match
          if (newVar === ownerVar) {
            matches.push({ owner, confidence: 'high', reason: 'Exact name match' });
            break;
          }
          
          // Partial match (considering married names)
          const newParts = newVar.split(/\s+/);
          const ownerParts = ownerVar.split(/\s+/);
          
          // Same first name, different last name (possible marriage)
          if (newParts[0] === ownerParts[0] && newParts.length >= 2 && ownerParts.length >= 2) {
            if (newParts[newParts.length - 1] !== ownerParts[ownerParts.length - 1]) {
              matches.push({ 
                owner, 
                confidence: 'medium', 
                reason: 'Same first name, different last name (possible marriage)' 
              });
            }
          }
          
          // Missing middle name/initial
          if (newParts.length !== ownerParts.length) {
            const shorterName = newParts.length < ownerParts.length ? newParts : ownerParts;
            const longerName = newParts.length > ownerParts.length ? newParts : ownerParts;
            
            if (shorterName[0] === longerName[0] && 
                shorterName[shorterName.length - 1] === longerName[longerName.length - 1]) {
              matches.push({ 
                owner, 
                confidence: 'medium', 
                reason: 'Missing middle name or initial' 
              });
            }
          }
        }
      }
    }
    
    // Remove duplicates
    return matches.filter((match, index, self) => 
      index === self.findIndex(m => m.owner.name === match.owner.name)
    );
  };

  const checkForNameMatches = (analysis: any): any => {
    if (!analysis.grantees || analysis.grantees.length === 0) return null;
    
    const potentialMatches = [];
    
    for (const grantee of analysis.grantees) {
      const matches = findPotentialMatches(grantee, ongoingOwnership.owners);
      if (matches.length > 0) {
        potentialMatches.push({
          newName: grantee,
          matches
        });
      }
    }
    
    return potentialMatches.length > 0 ? potentialMatches : null;
  };

  const handleNameMatchConfirmation = (confirmedMatches?: Record<string, any>) => {
    if (confirmedMatches) {
      // User confirmed specific matches, proceed with merging only those
      updateOngoingOwnership(pendingNameMatches.analysis, confirmedMatches);
    } else {
      // User rejected all matches, proceed as new owners
      updateOngoingOwnership(pendingNameMatches.analysis);
    }
    setPendingNameMatches(null);
    setIndividualMatchSelections({});
  };

  const handleIndividualMatchToggle = (newName: string, matchOwnerName: string, isSelected: boolean) => {
    const key = `${newName}-${matchOwnerName}`;
    setIndividualMatchSelections(prev => ({
      ...prev,
      [key]: isSelected
    }));
  };

  const applyIndividualSelections = () => {
    const confirmedMatches: Record<string, any> = {};
    
    // Build confirmed matches from individual selections
    pendingNameMatches.matches.forEach((match: any) => {
      match.matches.forEach((potentialMatch: any) => {
        const key = `${match.newName}-${potentialMatch.owner.name}`;
        if (individualMatchSelections[key]) {
          confirmedMatches[match.newName] = potentialMatch.owner;
        }
      });
    });
    
    handleNameMatchConfirmation(Object.keys(confirmedMatches).length > 0 ? confirmedMatches : undefined);
  };

  const updateOngoingOwnership = (analysis: any, confirmedMatches?: Record<string, any>) => {
    console.log('Updating ownership with analysis:', analysis);
    console.log('Current total acres:', totalAcres);
    
    // Save previous state before updating - this ensures we can show the visual transfer
    setPreviousOwnership({
      ...ongoingOwnership,
      lastUpdatedRow: currentRowIndex
    });
    
    setOngoingOwnership(prev => {
      const updated = { 
        ...prev, 
        pendingTransfers: prev.pendingTransfers || [] 
      };
      
      // Handle patent documents - original government grants include both surface and minerals unless reserved
      if (analysis.documentType === 'Patent' && analysis.grantees && analysis.grantees.length > 0) {
        const patentee = analysis.grantees[0];
        const grantor = analysis.grantors?.[0] || 'USA';
        console.log('Processing patent for:', patentee, 'from:', grantor);
        
        const effectiveAcres = totalAcres > 0 ? totalAcres : 80;
        
        // Check if minerals are specifically reserved in the description
        const mineralsReserved = analysis.description && (
          analysis.description.toLowerCase().includes('reserving') ||
          analysis.description.toLowerCase().includes('except') ||
          analysis.description.toLowerCase().includes('minerals reserved') ||
          analysis.description.toLowerCase().includes('mineral rights reserved')
        );
        
        const mineralPercentage = mineralsReserved ? 0 : 100;
        const netMineralAcres = mineralsReserved ? 0 : effectiveAcres;
        
        // For patents, if this is the first owner, set up the previous ownership to show USA transfer
        if (updated.owners.length === 0) {
          // Store the grantor (USA) as previous ownership to show the transfer
          setPreviousOwnership({
            owners: [{
              name: grantor,
              surfacePercentage: 100,
              mineralPercentage: mineralPercentage,
              netSurfaceAcres: effectiveAcres,
              netMineralAcres: netMineralAcres,
              acquisitionDocument: 'Original Government Ownership',
              currentLeaseStatus: 'unknown' as const
            }],
            pendingTransfers: [],
            totalSurfacePercentage: 100,
            totalMineralPercentage: mineralPercentage,
            totalAcres: effectiveAcres,
            landParcels: [],
            lastUpdatedRow: currentRowIndex
          });
        }
        
        const existingOwnerIndex = updated.owners.findIndex(o => 
          o.name.toLowerCase().includes(patentee.toLowerCase()) ||
          patentee.toLowerCase().includes(o.name.toLowerCase())
        );
        
        if (existingOwnerIndex >= 0) {
          updated.owners[existingOwnerIndex] = {
            ...updated.owners[existingOwnerIndex],
            surfacePercentage: 100,
            mineralPercentage: mineralPercentage,
            netSurfaceAcres: effectiveAcres,
            netMineralAcres: netMineralAcres,
            acquisitionDocument: analysis.recordingReference || analysis.documentNumber
          };
        } else {
          const newOwner = {
            name: patentee,
            surfacePercentage: 100,
            mineralPercentage: mineralPercentage,
            netSurfaceAcres: effectiveAcres,
            netMineralAcres: netMineralAcres,
            acquisitionDocument: analysis.recordingReference || analysis.documentNumber,
            currentLeaseStatus: 'unknown' as const
          };
          updated.owners.push(newOwner);
        }
        
        if (updated.totalAcres === 0) {
          updated.totalAcres = effectiveAcres;
        }
      }
      // Handle mineral deeds
      else if (analysis.ownershipChange && analysis.grantees) {
        const isMineralDeed = analysis.documentType === 'MD';
        const isSurfaceDeed = analysis.documentType === 'WD' && 
          (analysis.description?.toLowerCase().includes('surface') || 
           analysis.description?.toLowerCase().includes('minerals were previously conveyed'));
        
        if (isMineralDeed) {
          console.log('Processing mineral deed - grantor keeps surface, minerals split among grantees');
          
          const grantorName = analysis.grantors?.[0];
          if (grantorName) {
            const grantorIndex = updated.owners.findIndex(o => 
              o.name.toLowerCase().includes(grantorName.toLowerCase()) ||
              grantorName.toLowerCase().includes(o.name.toLowerCase())
            );
            
            if (grantorIndex >= 0) {
              // Grantor transfers minerals but keeps surface
              updated.owners[grantorIndex] = {
                ...updated.owners[grantorIndex],
                mineralPercentage: 0,
                netMineralAcres: 0,
                acquisitionDocument: analysis.recordingReference || analysis.documentNumber || updated.owners[grantorIndex].acquisitionDocument
              };
            } else {
              // Grantor not found - create pending transfer for minerals only
              console.log(`Grantor ${grantorName} not found - creating pending mineral transfer`);
              analysis.grantees.forEach((grantee: string) => {
                const pendingTransfer: PendingTransfer = {
                  grantorName: grantorName,
                  granteeName: grantee,
                  surfacePercentage: 0, // Mineral deed only
                  mineralPercentage: 100 / analysis.grantees.length, // Equal split among grantees
                  documentReference: analysis.recordingReference || analysis.documentNumber || `Row ${currentRowIndex + 1}`,
                  rowIndex: currentRowIndex,
                  transferType: 'mineral_only'
                };
                updated.pendingTransfers.push(pendingTransfer);
              });
              return updated; // Skip the normal grantee processing since we created pending transfers
            }
          }
          
          // Add all grantees with equal mineral rights split
          const numberOfGrantees = analysis.grantees.length;
          const mineralPercentagePerGrantee = 100 / numberOfGrantees;
          const effectiveAcres = totalAcres > 0 ? totalAcres : 80;
          const netMineralAcres = (mineralPercentagePerGrantee / 100) * effectiveAcres;
          
          analysis.grantees.forEach((grantee: string) => {
            // Check if this grantee matches an existing owner (including confirmed matches)
            let matchedOwner = null;
            if (confirmedMatches && confirmedMatches[grantee]) {
              matchedOwner = updated.owners.find(o => o.name === confirmedMatches[grantee].name);
            } else {
              matchedOwner = updated.owners.find(o => 
                o.name.toLowerCase().trim() === grantee.toLowerCase().trim()
              );
            }
            
            if (matchedOwner) {
              const existingOwnerIndex = updated.owners.findIndex(o => o.name === matchedOwner.name);
              updated.owners[existingOwnerIndex] = {
                ...updated.owners[existingOwnerIndex],
                name: confirmedMatches && confirmedMatches[grantee] && confirmedMatches[grantee].name !== grantee 
                  ? `${matchedOwner.name} AKA ${grantee}` 
                  : matchedOwner.name,
                mineralPercentage: updated.owners[existingOwnerIndex].mineralPercentage + mineralPercentagePerGrantee,
                netMineralAcres: updated.owners[existingOwnerIndex].netMineralAcres + netMineralAcres,
                acquisitionDocument: analysis.recordingReference || analysis.documentNumber || updated.owners[existingOwnerIndex].acquisitionDocument
              };
            } else {
              const newOwner = {
                name: grantee,
                surfacePercentage: 0,
                mineralPercentage: mineralPercentagePerGrantee,
                netSurfaceAcres: 0,
                netMineralAcres: netMineralAcres,
                acquisitionDocument: analysis.recordingReference || analysis.documentNumber,
                currentLeaseStatus: 'unknown' as const
              };
              updated.owners.push(newOwner);
            }
          });
        } else if (isSurfaceDeed) {
          console.log('Processing surface deed - grantor transfers surface, minerals stay with existing owners');
          
          const grantorName = analysis.grantors?.[0];
          let grantorSurfacePercentage = 100; // Default assumption
          
          if (grantorName) {
            const grantorIndex = updated.owners.findIndex(o => 
              o.name.toLowerCase().includes(grantorName.toLowerCase()) ||
              grantorName.toLowerCase().includes(o.name.toLowerCase())
            );
            
            if (grantorIndex >= 0) {
              grantorSurfacePercentage = updated.owners[grantorIndex].surfacePercentage;
              // Remove grantor's surface rights but keep mineral rights if any
              if (updated.owners[grantorIndex].mineralPercentage > 0) {
                updated.owners[grantorIndex] = {
                  ...updated.owners[grantorIndex],
                  surfacePercentage: 0,
                  netSurfaceAcres: 0,
                  acquisitionDocument: analysis.recordingReference || analysis.documentNumber || updated.owners[grantorIndex].acquisitionDocument
                };
              } else {
                // Remove grantor completely if they have no mineral rights
                updated.owners.splice(grantorIndex, 1);
              }
            } else {
              // Grantor not found - create pending transfer for surface only
              console.log(`Grantor ${grantorName} not found - creating pending surface transfer`);
              analysis.grantees.forEach((grantee: string) => {
                const pendingTransfer: PendingTransfer = {
                  grantorName: grantorName,
                  granteeName: grantee,
                  surfacePercentage: 100 / analysis.grantees.length, // Equal split among grantees
                  mineralPercentage: 0, // Surface deed only
                  documentReference: analysis.recordingReference || analysis.documentNumber || `Row ${currentRowIndex + 1}`,
                  rowIndex: currentRowIndex,
                  transferType: 'surface_only'
                };
                updated.pendingTransfers.push(pendingTransfer);
              });
              return updated; // Skip the normal grantee processing since we created pending transfers
            }
          }
          
          // Add grantees with equal surface rights split
          const numberOfGrantees = analysis.grantees.length;
          const surfacePercentagePerGrantee = grantorSurfacePercentage / numberOfGrantees;
          const effectiveAcres = totalAcres > 0 ? totalAcres : 80;
          const netSurfaceAcres = (surfacePercentagePerGrantee / 100) * effectiveAcres;
          
          analysis.grantees.forEach((grantee: string) => {
            // Check if this grantee matches an existing owner (including confirmed matches)
            let matchedOwner = null;
            if (confirmedMatches && confirmedMatches[grantee]) {
              matchedOwner = updated.owners.find(o => o.name === confirmedMatches[grantee].name);
            } else {
              matchedOwner = updated.owners.find(o => 
                o.name.toLowerCase().trim() === grantee.toLowerCase().trim()
              );
            }
            
            if (matchedOwner) {
              const existingOwnerIndex = updated.owners.findIndex(o => o.name === matchedOwner.name);
              updated.owners[existingOwnerIndex] = {
                ...updated.owners[existingOwnerIndex],
                name: confirmedMatches && confirmedMatches[grantee] && confirmedMatches[grantee].name !== grantee 
                  ? `${matchedOwner.name} AKA ${grantee}` 
                  : matchedOwner.name,
                surfacePercentage: updated.owners[existingOwnerIndex].surfacePercentage + surfacePercentagePerGrantee,
                netSurfaceAcres: updated.owners[existingOwnerIndex].netSurfaceAcres + netSurfaceAcres,
                acquisitionDocument: analysis.recordingReference || analysis.documentNumber || updated.owners[existingOwnerIndex].acquisitionDocument
              };
            } else {
              const newOwner = {
                name: grantee,
                surfacePercentage: surfacePercentagePerGrantee,
                mineralPercentage: 0,
                netSurfaceAcres: netSurfaceAcres,
                netMineralAcres: 0,
                acquisitionDocument: analysis.recordingReference || analysis.documentNumber,
                currentLeaseStatus: 'unknown' as const
              };
              updated.owners.push(newOwner);
            }
          });
        } else {
          // Regular deed - handle both surface and mineral rights together
          const grantorName = analysis.grantors?.[0];
          let grantorSurfacePercentage = 100;
          let grantorMineralPercentage = 100;
          
          // Check for mineral reservations in the description
          let reservedMineralPercentage = 0;
          if (analysis.description) {
            const desc = analysis.description.toLowerCase();
            
            // Look for common reservation patterns
            const reservationPatterns = [
              /reserving.*?(\d+\/\d+).*?mineral/i,
              /except.*?(\d+\/\d+).*?mineral/i,
              /saving.*?(\d+\/\d+).*?mineral/i,
              /mineral.*?(\d+\/\d+).*?reserved/i,
              /undivided\s+(\d+\/\d+).*?mineral.*?reserved/i
            ];
            
            for (const pattern of reservationPatterns) {
              const match = analysis.description.match(pattern);
              if (match) {
                const [numerator, denominator] = match[1].split('/').map(Number);
                reservedMineralPercentage = (numerator / denominator) * 100;
                console.log(`Found mineral reservation: ${match[1]} = ${reservedMineralPercentage}%`);
                break;
              }
            }
          }
          
          if (grantorName) {
            const grantorIndex = updated.owners.findIndex(o => 
              o.name.toLowerCase().includes(grantorName.toLowerCase()) ||
              grantorName.toLowerCase().includes(o.name.toLowerCase())
            );
            
            if (grantorIndex >= 0) {
              grantorSurfacePercentage = updated.owners[grantorIndex].surfacePercentage;
              grantorMineralPercentage = updated.owners[grantorIndex].mineralPercentage;
              
              // If there's a mineral reservation, keep that portion for the grantor
              if (reservedMineralPercentage > 0) {
                const reservedMinerals = (reservedMineralPercentage / 100) * grantorMineralPercentage;
                const effectiveAcres = totalAcres > 0 ? totalAcres : 80;
                const reservedNetMineralAcres = (reservedMinerals / 100) * effectiveAcres;
                
                updated.owners[grantorIndex] = {
                  ...updated.owners[grantorIndex],
                  surfacePercentage: 0, // Surface is transferred
                  mineralPercentage: reservedMinerals, // Keep reserved minerals
                  netSurfaceAcres: 0,
                  netMineralAcres: reservedNetMineralAcres,
                  acquisitionDocument: analysis.recordingReference || analysis.documentNumber || updated.owners[grantorIndex].acquisitionDocument
                };
                
                // Reduce the mineral percentage available for transfer
                grantorMineralPercentage -= reservedMinerals;
              } else {
                // No reservation, remove grantor completely
                updated.owners.splice(grantorIndex, 1);
              }
            } else {
              // Grantor not found - create pending transfer for both surface and minerals
              console.log(`Grantor ${grantorName} not found - creating pending full transfer`);
              analysis.grantees.forEach((grantee: string) => {
                const pendingTransfer: PendingTransfer = {
                  grantorName: grantorName,
                  granteeName: grantee,
                  surfacePercentage: 100 / analysis.grantees.length, // Equal split among grantees
                  mineralPercentage: (100 - reservedMineralPercentage) / analysis.grantees.length,
                  documentReference: analysis.recordingReference || analysis.documentNumber || `Row ${currentRowIndex + 1}`,
                  rowIndex: currentRowIndex,
                  transferType: 'full',
                  reservedMineralPercentage: reservedMineralPercentage
                };
                updated.pendingTransfers.push(pendingTransfer);
              });
              return updated; // Skip the normal grantee processing since we created pending transfers
            }
          }
          
          const numberOfGrantees = analysis.grantees.length;
          const surfacePercentagePerGrantee = grantorSurfacePercentage / numberOfGrantees;
          const mineralPercentagePerGrantee = grantorMineralPercentage / numberOfGrantees;
          const effectiveAcres = totalAcres > 0 ? totalAcres : 80;
          const netSurfaceAcres = (surfacePercentagePerGrantee / 100) * effectiveAcres;
          const netMineralAcres = (mineralPercentagePerGrantee / 100) * effectiveAcres;
          
          analysis.grantees.forEach((grantee: string) => {
            // Check if this grantee matches an existing owner (including confirmed matches)
            let matchedOwner = null;
            if (confirmedMatches && confirmedMatches[grantee]) {
              matchedOwner = updated.owners.find(o => o.name === confirmedMatches[grantee].name);
            } else {
              matchedOwner = updated.owners.find(o => 
                o.name.toLowerCase().trim() === grantee.toLowerCase().trim()
              );
            }
            
            if (matchedOwner) {
              const existingOwnerIndex = updated.owners.findIndex(o => o.name === matchedOwner.name);
              updated.owners[existingOwnerIndex] = {
                ...updated.owners[existingOwnerIndex],
                name: confirmedMatches && confirmedMatches[grantee] && confirmedMatches[grantee].name !== grantee 
                  ? `${matchedOwner.name} AKA ${grantee}` 
                  : matchedOwner.name,
                surfacePercentage: updated.owners[existingOwnerIndex].surfacePercentage + surfacePercentagePerGrantee,
                mineralPercentage: updated.owners[existingOwnerIndex].mineralPercentage + mineralPercentagePerGrantee,
                netSurfaceAcres: updated.owners[existingOwnerIndex].netSurfaceAcres + netSurfaceAcres,
                netMineralAcres: updated.owners[existingOwnerIndex].netMineralAcres + netMineralAcres,
                acquisitionDocument: analysis.recordingReference || analysis.documentNumber || updated.owners[existingOwnerIndex].acquisitionDocument
              };
            } else {
              const newOwner = {
                name: grantee,
                surfacePercentage: surfacePercentagePerGrantee,
                mineralPercentage: mineralPercentagePerGrantee,
                netSurfaceAcres: netSurfaceAcres,
                netMineralAcres: netMineralAcres,
                acquisitionDocument: analysis.recordingReference || analysis.documentNumber,
                currentLeaseStatus: 'unknown' as const
              };
              updated.owners.push(newOwner);
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

      // Check if any new owners have pending transfers waiting for them
      if (updated.pendingTransfers && updated.pendingTransfers.length > 0) {
        updated.owners.forEach((owner, index) => {
          const ownerPendingTransfers = updated.pendingTransfers.filter(pt =>
          pt.grantorName.toLowerCase().includes(owner.name.toLowerCase()) ||
          owner.name.toLowerCase().includes(pt.grantorName.toLowerCase())
        );

        if (ownerPendingTransfers.length > 0) {
          console.log(`Found ${ownerPendingTransfers.length} pending transfers for ${owner.name}`);
          
          ownerPendingTransfers.forEach(pendingTransfer => {
            // Apply the pending transfer
            const surfaceToTransfer = (pendingTransfer.surfacePercentage / 100) * owner.surfacePercentage;
            const mineralToTransfer = (pendingTransfer.mineralPercentage / 100) * owner.mineralPercentage;
            const effectiveAcres = totalAcres > 0 ? totalAcres : 80;
            
            // Reduce current owner's percentage
            updated.owners[index] = {
              ...updated.owners[index],
              surfacePercentage: updated.owners[index].surfacePercentage - surfaceToTransfer,
              mineralPercentage: updated.owners[index].mineralPercentage - mineralToTransfer,
              netSurfaceAcres: ((updated.owners[index].surfacePercentage - surfaceToTransfer) / 100) * effectiveAcres,
              netMineralAcres: ((updated.owners[index].mineralPercentage - mineralToTransfer) / 100) * effectiveAcres
            };

            // Find or create the grantee
            const granteeIndex = updated.owners.findIndex(o => 
              o.name.toLowerCase().trim() === pendingTransfer.granteeName.toLowerCase().trim()
            );

            if (granteeIndex >= 0) {
              updated.owners[granteeIndex] = {
                ...updated.owners[granteeIndex],
                surfacePercentage: updated.owners[granteeIndex].surfacePercentage + surfaceToTransfer,
                mineralPercentage: updated.owners[granteeIndex].mineralPercentage + mineralToTransfer,
                netSurfaceAcres: updated.owners[granteeIndex].netSurfaceAcres + ((surfaceToTransfer / 100) * effectiveAcres),
                netMineralAcres: updated.owners[granteeIndex].netMineralAcres + ((mineralToTransfer / 100) * effectiveAcres),
                acquisitionDocument: pendingTransfer.documentReference
              };
            } else {
              // Create new owner for the grantee
              const newOwner = {
                name: pendingTransfer.granteeName,
                surfacePercentage: surfaceToTransfer,
                mineralPercentage: mineralToTransfer,
                netSurfaceAcres: (surfaceToTransfer / 100) * effectiveAcres,
                netMineralAcres: (mineralToTransfer / 100) * effectiveAcres,
                acquisitionDocument: pendingTransfer.documentReference,
                currentLeaseStatus: 'unknown' as const
              };
              updated.owners.push(newOwner);
            }
          });

          // Remove the processed pending transfers
          updated.pendingTransfers = updated.pendingTransfers.filter(pt => 
            !ownerPendingTransfers.some(opt => opt.documentReference === pt.documentReference)
          );
        }
        });
      }

      // Calculate total percentages
      updated.totalSurfacePercentage = updated.owners.reduce((sum, owner) => sum + owner.surfacePercentage, 0);
      updated.totalMineralPercentage = updated.owners.reduce((sum, owner) => sum + owner.mineralPercentage, 0);
      updated.lastUpdatedRow = currentRowIndex;
      
      console.log('Final updated ownership:', updated);
      
      return updated;
    });
  };

  const approveCurrentRow = () => {
    // Store current ownership state before moving to next row
    setOwnershipHistory(prev => ({
      ...prev,
      [currentRowIndex]: { ...ongoingOwnership }
    }));
    
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
      pendingTransfers: [],
      totalSurfacePercentage: 0,
      totalMineralPercentage: 0,
      totalAcres: totalAcres,
      landParcels: [],
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
    <>
      {/* Main Analysis Section */}
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

        {/* Two Column Layout - Auto Height with Min Height */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 min-h-[60vh]">
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
          <CardHeader className="flex-shrink-0">
            <CardTitle>Ongoing Ownership Summary</CardTitle>
          </CardHeader>
          <CardContent className="flex-1 overflow-hidden p-4">
            <div className="h-full flex flex-col space-y-4">
              {/* Summary Stats - Fixed Height */}
              <div className="grid grid-cols-2 gap-4 text-sm flex-shrink-0">
                 <div>
                   <span className="font-medium">Surface Rights:</span>
                   <div className="text-lg font-bold">{(ongoingOwnership.totalSurfacePercentage || 0).toFixed(2)}%</div>
                 </div>
                 <div>
                   <span className="font-medium">Mineral Rights:</span>
                   <div className="text-lg font-bold">{(ongoingOwnership.totalMineralPercentage || 0).toFixed(2)}%</div>
                 </div>
                 <div className="col-span-2">
                   <span className="font-medium">Total Acres:</span>
                   <div className="text-lg font-bold">{ongoingOwnership.totalAcres || 0}</div>
                 </div>
              </div>

              {/* Owners List - Scrollable */}
              <div className="flex-1 flex flex-col min-h-0">
                <div className="text-sm font-medium mb-2 flex-shrink-0">Current Owners:</div>
                <div className="flex-1 overflow-y-auto space-y-2 pr-2">
                   {ongoingOwnership.owners.length === 0 ? (
                     <div className="text-sm text-muted-foreground text-center py-4">
                       No owners identified yet
                     </div>
                   ) : (
                     <>
                       {/* Show previous owners with strikethrough if they were removed */}
                       {previousOwnership.owners.length > 0 && ongoingOwnership.lastUpdatedRow === currentRowIndex && (
                         <>
                            {previousOwnership.owners.map((prevOwner, index) => {
                              const currentOwner = ongoingOwnership.owners.find(o => 
                                o.name.toLowerCase().trim() === prevOwner.name.toLowerCase().trim()
                              );
                              
                              // Show completely transferred owners (no longer exists)
                              if (!currentOwner) {
                                return (
                                  <div key={`prev-${index}`} className="p-3 bg-red-50 border border-red-200 rounded text-sm opacity-75">
                                    <div className="font-medium flex items-center gap-2 line-through text-red-600">
                                      {prevOwner.name}
                                      <Badge variant="destructive" className="text-xs">
                                        TRANSFERRED
                                      </Badge>
                                    </div>
                                    <div className="flex justify-between text-xs text-red-500 line-through">
                                      <span>Surface: {(prevOwner.surfacePercentage || 0).toFixed(2)}%</span>
                                      <span>Mineral: {(prevOwner.mineralPercentage || 0).toFixed(2)}%</span>
                                    </div>
                                  </div>
                                );
                              }
                              
                              // Show partially transferred owners (surface or mineral rights changed)
                              const surfaceChanged = currentOwner.surfacePercentage !== prevOwner.surfacePercentage;
                              const mineralChanged = currentOwner.mineralPercentage !== prevOwner.mineralPercentage;
                              
                              if (surfaceChanged || mineralChanged) {
                                return (
                                  <div key={`partial-${index}`} className="p-3 bg-orange-50 border border-orange-200 rounded text-sm">
                                    <div className="font-medium flex items-center gap-2">
                                      {prevOwner.name}
                                      <Badge variant="secondary" className="text-xs bg-orange-600 text-white">
                                        PARTIAL TRANSFER
                                      </Badge>
                                    </div>
                                    <div className="space-y-1 text-xs">
                                      {surfaceChanged && (
                                        <div className="flex justify-between">
                                          <span className="text-red-500 line-through">
                                            Surface: {(prevOwner.surfacePercentage || 0).toFixed(2)}%
                                          </span>
                                          <span className="text-green-600">
                                            → {(currentOwner.surfacePercentage || 0).toFixed(2)}%
                                          </span>
                                        </div>
                                      )}
                                      {mineralChanged && (
                                        <div className="flex justify-between">
                                          <span className="text-red-500 line-through">
                                            Mineral: {(prevOwner.mineralPercentage || 0).toFixed(2)}%
                                          </span>
                                          <span className="text-green-600">
                                            → {(currentOwner.mineralPercentage || 0).toFixed(2)}%
                                          </span>
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                );
                              }
                              
                              return null;
                           })}
                         </>
                       )}
                       
                        {/* Show current owners with highlighting for new/changed ones */}
                        {ongoingOwnership.owners
                          .filter(owner => owner.surfacePercentage > 0 || owner.mineralPercentage > 0)
                          .map((owner, index) => {
                         const wasNew = previousOwnership.owners.length > 0 && 
                           ongoingOwnership.lastUpdatedRow === currentRowIndex &&
                           !previousOwnership.owners.find(o => 
                             o.name.toLowerCase().trim() === owner.name.toLowerCase().trim()
                           );
                         
                         const wasChanged = previousOwnership.owners.length > 0 && 
                           ongoingOwnership.lastUpdatedRow === currentRowIndex &&
                           previousOwnership.owners.find(o => 
                             o.name.toLowerCase().trim() === owner.name.toLowerCase().trim() &&
                             (o.surfacePercentage !== owner.surfacePercentage || o.mineralPercentage !== owner.mineralPercentage)
                           );

                          // Special handling for owners being transferred
                          if (owner.isBeingTransferred) {
                            return (
                              <div 
                                key={index} 
                                className="p-3 bg-red-50 border border-red-200 rounded text-sm opacity-75"
                              >
                                <div className="font-medium flex items-center gap-2 line-through text-red-600">
                                  {owner.name}
                                  <Badge variant="destructive" className="text-xs">
                                    TRANSFERRED
                                  </Badge>
                                </div>
                                <div className="flex justify-between text-xs text-red-500 line-through">
                                  <span>Surface: {(owner.surfacePercentage || 0).toFixed(2)}%</span>
                                  <span>Mineral: {(owner.mineralPercentage || 0).toFixed(2)}%</span>
                                </div>
                              </div>
                            );
                          }

                          return (
                            <div 
                              key={index} 
                              className={`p-3 rounded text-sm ${
                                wasNew 
                                  ? "bg-green-50 border border-green-200" 
                                  : wasChanged 
                                    ? "bg-blue-50 border border-blue-200"
                                    : "bg-muted"
                              }`}
                            >
                              <div className="font-medium flex items-center gap-2">
                                {owner.name}
                                {wasNew && (
                                  <Badge variant="default" className="text-xs bg-green-600">
                                    NEW
                                  </Badge>
                                )}
                                {wasChanged && (
                                  <Badge variant="default" className="text-xs bg-blue-600">
                                    CHANGED
                                  </Badge>
                                )}
                             </div>
                             <div className="space-y-1 text-xs text-muted-foreground">
                                <div className="flex justify-between">
                                  <span>Surface: {(owner.surfacePercentage || 0).toFixed(2)}%</span>
                                  <span>{(owner.netSurfaceAcres || 0).toFixed(2)} acres</span>
                                </div>
                                <div className="flex justify-between">
                                  <span>Mineral: {(owner.mineralPercentage || 0).toFixed(2)}%</span>
                                  <span>{(owner.netMineralAcres || 0).toFixed(2)} acres</span>
                                </div>
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
                          );
                        })}
                        
                         {/* Show pending transfers */}
                         {ongoingOwnership.pendingTransfers && ongoingOwnership.pendingTransfers.length > 0 && (
                           <div className="mt-4">
                             <h4 className="text-sm font-medium text-amber-700 mb-2">Pending Transfers</h4>
                             {ongoingOwnership.pendingTransfers.map((transfer, index) => (
                               <div key={index} className="p-3 bg-amber-50 border border-amber-200 rounded text-sm">
                                 <div className="font-medium flex items-center gap-2 text-amber-800">
                                   {transfer.grantorName} → {transfer.granteeName}
                                   <Badge variant="outline" className="text-xs border-amber-300 text-amber-700">
                                     PENDING
                                   </Badge>
                                 </div>
                                 <div className="text-xs text-amber-600 mt-1">
                                   Surface: {transfer.surfacePercentage}% | Mineral: {transfer.mineralPercentage}%
                                 </div>
                                 <div className="text-xs text-amber-600">
                                   Doc: {transfer.documentReference}
                                 </div>
                               </div>
                             ))}
                           </div>
                         )}
                         
                         {/* AKA Party Combination Button */}
                         <div className="mt-4">
                           <Button 
                             variant="outline" 
                             size="sm"
                             onClick={() => {
                               // Find potential AKA parties (similar names)
                               const potentialAKAs = ongoingOwnership.owners
                                 .map((owner, index) => ({ ...owner, originalIndex: index }))
                                 .filter((owner, index, array) => 
                                   array.some((other, otherIndex) => 
                                     otherIndex !== index &&
                                     (owner.name.toLowerCase().includes(other.name.toLowerCase()) ||
                                      other.name.toLowerCase().includes(owner.name.toLowerCase()) ||
                                      // Check for common patterns like "John Smith" vs "Smith, John"
                                      owner.name.split(/[\s,]+/).some(part => 
                                        other.name.split(/[\s,]+/).some(otherPart => 
                                          part.length > 2 && otherPart.length > 2 && 
                                          part.toLowerCase() === otherPart.toLowerCase()
                                        )
                                      ))
                                   )
                                 );
                               
                               if (potentialAKAs.length === 0) {
                                 alert('No potential AKA parties found in current ownership.');
                                 return;
                               }
                               
                               // Simple implementation - combine first two potential AKAs
                               const first = potentialAKAs[0];
                               const second = potentialAKAs.find(p => p.originalIndex !== first.originalIndex);
                               
                               if (second) {
                                 const combinedName = prompt(
                                   `Combine "${first.name}" and "${second.name}"?\n\nEnter the preferred name:`,
                                   first.name
                                 );
                                 
                                 if (combinedName && combinedName.trim()) {
                                   setOngoingOwnership(prev => {
                                     const updated = { ...prev };
                                     const combinedOwner = {
                                       ...first,
                                       name: combinedName.trim(),
                                       surfacePercentage: first.surfacePercentage + second.surfacePercentage,
                                       mineralPercentage: first.mineralPercentage + second.mineralPercentage
                                     };
                                     
                                     updated.owners = updated.owners
                                       .filter((_, index) => index !== first.originalIndex && index !== second.originalIndex)
                                       .concat([combinedOwner]);
                                     
                                     updated.totalSurfacePercentage = updated.owners.reduce((sum, owner) => sum + owner.surfacePercentage, 0);
                                     updated.totalMineralPercentage = updated.owners.reduce((sum, owner) => sum + owner.mineralPercentage, 0);
                                     
                                     return updated;
                                   });
                                   
                                   toast({
                                     title: "AKA Parties Combined",
                                     description: `Combined "${first.name}" and "${second.name}" into "${combinedName.trim()}"`
                                   });
                                 }
                               }
                             }}
                             className="text-xs"
                           >
                             Combine AKA Parties
                           </Button>
                         </div>
                      </>
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
                          // Check if we need to restore ownership state when going to a previous row
                          if (index < currentRowIndex && ownershipHistory[index]) {
                            setOngoingOwnership(ownershipHistory[index]);
                            console.log(`Restored ownership state to row ${index}`);
                          }
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

      {/* Name Matching Dialog */}
      <Dialog open={!!pendingNameMatches} onOpenChange={() => setPendingNameMatches(null)}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Potential Name Matches Found</DialogTitle>
            <DialogDescription>
              Some grantees might be the same people as existing owners. Please review each match individually:
            </DialogDescription>
          </DialogHeader>
          
          {pendingNameMatches && (
            <div className="space-y-6">
              {pendingNameMatches.matches.map((match: any, index: number) => (
                <div key={index} className="border rounded-lg p-4 space-y-3">
                  <div className="font-medium text-lg">
                    New Grantee: <span className="text-primary">{match.newName}</span>
                  </div>
                  
                  <div className="space-y-3">
                    <div className="text-sm font-medium text-muted-foreground">Potential matches:</div>
                    {match.matches.map((potentialMatch: any, matchIndex: number) => {
                      const selectionKey = `${match.newName}-${potentialMatch.owner.name}`;
                      const isSelected = individualMatchSelections[selectionKey] || false;
                      
                      return (
                        <div key={matchIndex} className="bg-muted p-4 rounded flex justify-between items-center">
                          <div className="flex-1">
                            <div className="font-medium">{potentialMatch.owner.name}</div>
                            <div className="text-sm text-muted-foreground">
                              Surface: {potentialMatch.owner.surfacePercentage}% | 
                              Mineral: {potentialMatch.owner.mineralPercentage}%
                            </div>
                            <div className="text-sm text-blue-600 mt-1">
                              {potentialMatch.reason}
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            <Badge variant={potentialMatch.confidence === 'high' ? 'default' : 'secondary'}>
                              {potentialMatch.confidence} confidence
                            </Badge>
                            <div className="flex items-center gap-2">
                              <input
                                type="checkbox"
                                id={selectionKey}
                                checked={isSelected}
                                onChange={(e) => handleIndividualMatchToggle(
                                  match.newName, 
                                  potentialMatch.owner.name, 
                                  e.target.checked
                                )}
                                className="w-4 h-4 text-primary border-2 border-muted-foreground rounded focus:ring-primary"
                              />
                              <label htmlFor={selectionKey} className="text-sm font-medium">
                                Same person
                              </label>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
              
              <div className="flex gap-3 pt-4 border-t">
                <Button 
                  onClick={applyIndividualSelections}
                  className="flex-1"
                >
                  Apply Selections
                </Button>
                <Button 
                  variant="outline" 
                  onClick={() => handleNameMatchConfirmation()}
                  className="flex-1"
                >
                  All are different people (add as new owners)
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};
