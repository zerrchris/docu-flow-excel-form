import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Download, FileSpreadsheet, FileText, RefreshCw, ChevronLeft, ChevronRight } from 'lucide-react';
import { LeaseCheckData, MineralOwner, Tract, TractData } from '@/pages/LeaseCheck';
import { useToast } from '@/hooks/use-toast';

interface StructuredMineralOwner {
  name: string;
  interests: string;
  netAcres: number;
  leaseholdStatus: string;
  lastLeaseOfRecord?: {
    lessor: string;
    lessee: string;
    dated: string;
    term: string;
    expiration: string;
    recorded: string;
    documentNumber: string;
  };
  landsConveredOnLease?: string[];
  listedAcreage?: string;
}

interface StructuredLeaseCheckData {
  prospect: string;
  totalAcres: number;
  reportFormat?: string;
  owners?: StructuredMineralOwner[];
  tracts?: Tract[];
  wells: string[];
  limitationsAndExceptions: string;
}

interface LeaseCheckReportProps {
  data: LeaseCheckData | StructuredLeaseCheckData;
  selectedTractIndex?: number;
  onTractChange?: (index: number) => void;
  manualAcres?: { [tractId: string]: number };
  onUpdateAcres?: (tractId: string, acres: number) => void;
  onNewAnalysis: () => void;
}

export const LeaseCheckReport: React.FC<LeaseCheckReportProps> = ({ 
  data, 
  selectedTractIndex = 0, 
  onTractChange, 
  manualAcres = {}, 
  onUpdateAcres, 
  onNewAnalysis 
}) => {
  const { toast } = useToast();
  
  // Check if this is the new multi-tract format
  const isMultiTractFormat = (data as any).hasMultipleTracts && (data as any).tracts;
  const isStructuredFormat = (data as any).reportFormat === 'structured' || 
    ('owners' in data && Array.isArray(data.owners) && !('tracts' in data));

  const getCurrentTract = (): TractData | null => {
    if (isMultiTractFormat) {
      const multiTractData = data as any;
      return multiTractData.tracts[selectedTractIndex] || null;
    }
    
    if (isStructuredFormat) {
      // Convert legacy format to tract format
      const legacyData = data as StructuredLeaseCheckData;
      return {
        tractId: "Main Tract",
        legalDescription: legacyData.prospect,
        totalAcres: legacyData.totalAcres,
        owners: legacyData.owners || [],
        wells: legacyData.wells || [],
        limitationsAndExceptions: legacyData.limitationsAndExceptions
      };
    }
    
    return null;
  };

  const currentTract = getCurrentTract();
  const getEffectiveAcres = (tract: TractData) => {
    if (manualAcres[tract.tractId]) {
      return manualAcres[tract.tractId];
    }
    return typeof tract.totalAcres === 'number' ? tract.totalAcres : 0;
  };

  const getStatusBadgeVariant = (status: string) => {
    switch (status) {
      case 'Leased':
      case 'Last Lease of Record':
        return 'default';
      case 'Open/Unleased':
      case 'Appears Open':
        return 'secondary';
      case 'Expired (Potential HBP)':
        return 'destructive';
      default:
        return 'outline';
    }
  };

  const generateStructuredReportText = () => {
    if (isMultiTractFormat) {
      const multiTractData = data as any;
      const tract = currentTract;
      if (!tract) return '';
      
      const date = new Date().toLocaleDateString();
      const effectiveAcres = getEffectiveAcres(tract);
      
      let report = `OIL AND GAS OWNERSHIP & LEASEHOLD TAKEOFF\n\n`;
      report += `INDEX DATE: ${date}\n`;
      report += `COMPLETED DATE: ${date}\n`;
      report += `PROSPECT: ${multiTractData.prospect}\n`;
      report += `TRACT: ${tract.tractId}\n`;
      report += `LEGAL DESCRIPTION: ${tract.legalDescription}\n`;
      report += `TOTAL ACRES: ${effectiveAcres}\n\n`;

      report += `MINERAL OWNER\tINTERESTS\tNET ACRES\tLEASEHOLD STATUS\n`;
      report += `${'='.repeat(80)}\n`;

      tract.owners?.forEach((owner, index) => {
        report += `${index + 1}.\t${owner.name}\t${owner.interests}\t${typeof owner.netAcres === 'number' ? owner.netAcres : parseFloat(owner.netAcres || '0')}\t${owner.leaseholdStatus}\n`;
        
        if (owner.lastLeaseOfRecord) {
          report += `\tLast Lease of Record:\n`;
          report += `\tLessor: ${owner.lastLeaseOfRecord.lessor}\n`;
          report += `\tLessee: ${owner.lastLeaseOfRecord.lessee}\n`;
          report += `\tDated: ${owner.lastLeaseOfRecord.dated}\n`;
          report += `\tTerm: ${owner.lastLeaseOfRecord.term}\n`;
          report += `\tExpiration: ${owner.lastLeaseOfRecord.expiration}\n`;
          report += `\tRecorded: ${owner.lastLeaseOfRecord.recorded}\n`;
          report += `\tDocument #: ${owner.lastLeaseOfRecord.documentNumber}\n`;
          
          if (owner.landsConveredOnLease && owner.landsConveredOnLease.length > 0) {
            report += `\tLands Covered on Lease:\n`;
            owner.landsConveredOnLease.forEach(land => {
              report += `\t${land}\n`;
            });
          }
          
          if (owner.listedAcreage) {
            report += `\tListed Acreage: ${owner.listedAcreage}\n`;
          }
        }
        report += `\n`;
      });

      report += `Total: 100.00000000%\t${effectiveAcres}.00000000\n\n`;

      if (tract.wells && tract.wells.length > 0) {
        report += `WELL SUMMARY:\n`;
        tract.wells.forEach(well => {
          report += `${well}\n`;
        });
        report += `\n`;
      }

      report += `LIMITATIONS AND EXCEPTIONS:\n`;
      report += `${tract.limitationsAndExceptions}\n\n`;
      report += `Prepared by: AI Lease Check Analyzer\nPowered by Lovable\n`;

      return report;
    } else {
      // Legacy single tract format
      const structuredData = data as StructuredLeaseCheckData;
      const date = new Date().toLocaleDateString();
      let report = `OIL AND GAS OWNERSHIP & LEASEHOLD TAKEOFF\n\n`;
      report += `INDEX DATE: ${date}\n`;
      report += `COMPLETED DATE: ${date}\n`;
      report += `PROSPECT: ${structuredData.prospect}\n`;
      report += `LEGAL DESCRIPTION: ${structuredData.prospect}\n`;
      report += `TOTAL ACRES: ${structuredData.totalAcres}\n\n`;

      // ... keep existing legacy code
      return report;
    }
  };

  const generateOriginalReportText = () => {
    const originalData = data as LeaseCheckData;
    const date = new Date().toLocaleDateString();
    let report = `LEASE CHECK REPORT\n`;
    report += `Index Date: ${date}\n`;
    report += `Completed Date: ${date}\n`;
    report += `Prospect: ${originalData.prospect}\n`;
    report += `Total Acres: ${originalData.totalAcres}\n\n`;

    // ... keep existing original format logic
    return report;
  };

  const generateSpreadsheetData = () => {
    if (isMultiTractFormat) {
      const tract = currentTract;
      if (!tract) return [];
      
      return tract.owners?.map((owner, index) => ({
        Number: index + 1,
        MineralOwner: owner.name,
        Interests: owner.interests,
        NetAcres: typeof owner.netAcres === 'number' ? owner.netAcres : parseFloat(owner.netAcres || '0'),
        LeaseholdStatus: owner.leaseholdStatus,
        LastLease_Lessor: owner.lastLeaseOfRecord?.lessor || '',
        LastLease_Lessee: owner.lastLeaseOfRecord?.lessee || '',
        LastLease_Dated: owner.lastLeaseOfRecord?.dated || '',
        LastLease_Term: owner.lastLeaseOfRecord?.term || '',
        LastLease_Expiration: owner.lastLeaseOfRecord?.expiration || '',
        ListedAcreage: owner.listedAcreage || ''
      })) || [];
    } else if (isStructuredFormat) {
      const structuredData = data as StructuredLeaseCheckData;
      return structuredData.owners?.map((owner, index) => ({
        Number: index + 1,
        MineralOwner: owner.name,
        Interests: owner.interests,
        NetAcres: typeof owner.netAcres === 'number' ? owner.netAcres : parseFloat(owner.netAcres || '0'),
        LeaseholdStatus: owner.leaseholdStatus,
        LastLease_Lessor: owner.lastLeaseOfRecord?.lessor || '',
        LastLease_Lessee: owner.lastLeaseOfRecord?.lessee || '',
        LastLease_Dated: owner.lastLeaseOfRecord?.dated || '',
        LastLease_Term: owner.lastLeaseOfRecord?.term || '',
        LastLease_Expiration: owner.lastLeaseOfRecord?.expiration || '',
        ListedAcreage: owner.listedAcreage || ''
      })) || [];
    } else {
      return [];
    }
  };

  const downloadReport = () => {
    const reportText = (isMultiTractFormat || isStructuredFormat) ? generateStructuredReportText() : generateOriginalReportText();
    const tract = currentTract;
    const filename = isMultiTractFormat && tract ? 
      `lease-check-report-${tract.tractId.replace(/[^a-zA-Z0-9]/g, '_')}-${Date.now()}.txt` :
      `lease-check-report-${Date.now()}.txt`;
      
    const blob = new Blob([reportText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    toast({
      title: "Report Downloaded",
      description: isMultiTractFormat ? `Report for ${currentTract?.tractId} downloaded` : "Lease check report has been downloaded as a text file",
    });
  };

  const downloadSpreadsheet = () => {
    const spreadsheetData = generateSpreadsheetData();
    if (spreadsheetData.length === 0) return;
    
    const tract = currentTract;
    const filename = isMultiTractFormat && tract ? 
      `lease-check-data-${tract.tractId.replace(/[^a-zA-Z0-9]/g, '_')}-${Date.now()}.csv` :
      `lease-check-data-${Date.now()}.csv`;
    
    const csvContent = [
      Object.keys(spreadsheetData[0]).join(','),
      ...spreadsheetData.map(row => 
        Object.values(row).map(value => 
          typeof value === 'string' && value.includes(',') 
            ? `"${value.replace(/"/g, '""')}"` 
            : value
        ).join(',')
      )
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    toast({
      title: "Data Exported",
      description: isMultiTractFormat ? `Data for ${currentTract?.tractId} exported` : "Lease check data has been exported as a CSV file",
    });
  };

  // Multi-tract format rendering
  if (isMultiTractFormat) {
    const multiTractData = data as any;
    const tract = currentTract;
    
    if (!tract) {
      return <div>No tract data available</div>;
    }

    const effectiveAcres = getEffectiveAcres(tract);
    
    return (
      <div className="space-y-6">
        {/* Tract Navigation */}
        {multiTractData.tracts.length > 1 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>Multiple Tracts Detected</span>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onTractChange?.(Math.max(0, selectedTractIndex - 1))}
                    disabled={selectedTractIndex === 0}
                  >
                    <ChevronLeft className="h-4 w-4" />
                    Previous
                  </Button>
                  <span className="text-sm text-muted-foreground">
                    {selectedTractIndex + 1} of {multiTractData.tracts.length}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onTractChange?.(Math.min(multiTractData.tracts.length - 1, selectedTractIndex + 1))}
                    disabled={selectedTractIndex === multiTractData.tracts.length - 1}
                  >
                    Next
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Select
                value={selectedTractIndex.toString()}
                onValueChange={(value) => onTractChange?.(parseInt(value))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select tract" />
                </SelectTrigger>
                <SelectContent>
                  {multiTractData.tracts.map((t: TractData, index: number) => (
                    <SelectItem key={index} value={index.toString()}>
                      {t.tractId} - {t.legalDescription}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </CardContent>
          </Card>
        )}

        {/* Header Actions */}
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-2xl font-bold">Oil and Gas Ownership & Leasehold Takeoff</h2>
            <p className="text-muted-foreground">
              Analysis completed for {tract.tractId}
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={downloadReport}>
              <FileText className="w-4 h-4 mr-2" />
              Download Report
            </Button>
            <Button variant="outline" onClick={downloadSpreadsheet}>
              <FileSpreadsheet className="w-4 h-4 mr-2" />
              Export CSV
            </Button>
            <Button onClick={onNewAnalysis}>
              <RefreshCw className="w-4 h-4 mr-2" />
              New Analysis
            </Button>
          </div>
        </div>

        {/* Summary Card with Manual Acres Input */}
        <Card>
          <CardHeader>
            <CardTitle>Tract Information</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <div className="text-sm font-medium text-muted-foreground">Legal Description</div>
                <div className="text-lg font-semibold">{tract.legalDescription}</div>
              </div>
              <div>
                <div className="text-sm font-medium text-muted-foreground">Total Acres</div>
                {tract.needsManualAcres || typeof tract.totalAcres === 'string' ? (
                  <div className="space-y-2">
                    <div className="text-sm text-yellow-600">
                      {tract.grossAcreageNote || "Requires manual input"}
                    </div>
                    <div className="flex items-center gap-2">
                      <Label htmlFor="manual-acres" className="text-xs">Enter correct acres:</Label>
                      <Input
                        id="manual-acres"
                        type="number"
                        placeholder="0"
                        value={manualAcres[tract.tractId] || ''}
                        onChange={(e) => onUpdateAcres?.(tract.tractId, parseFloat(e.target.value) || 0)}
                        className="w-24 h-8 text-sm"
                      />
                    </div>
                    <div className="text-lg font-semibold">
                      {effectiveAcres.toFixed(8)}
                    </div>
                  </div>
                ) : (
                  <div className="text-lg font-semibold">{effectiveAcres.toFixed(8)}</div>
                )}
              </div>
              <div>
                <div className="text-sm font-medium text-muted-foreground">Total Owners</div>
                <div className="text-lg font-semibold">{tract.owners?.length || 0}</div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Ownership Table - Exact format from sample */}
        <Card>
          <CardHeader>
            <CardTitle>Mineral Ownership & Leasehold Status</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">#</TableHead>
                  <TableHead>MINERAL OWNER</TableHead>
                  <TableHead className="text-right">INTERESTS</TableHead>
                  <TableHead className="text-right">NET ACRES</TableHead>
                  <TableHead>LEASEHOLD STATUS</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tract.owners?.map((owner, index) => (
                  <TableRow key={index} className="border-b">
                    <TableCell className="font-medium">{index + 1}</TableCell>
                    <TableCell>
                      <div className="font-medium">{owner.name}</div>
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {owner.interests}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {typeof owner.netAcres === 'number' ? owner.netAcres.toFixed(7) : parseFloat(owner.netAcres || '0').toFixed(7)}
                    </TableCell>
                    <TableCell>
                      <div className="space-y-2">
                        <Badge variant={getStatusBadgeVariant(owner.leaseholdStatus)}>
                          {owner.leaseholdStatus}
                        </Badge>
                        
                        {owner.lastLeaseOfRecord && (
                          <div className="text-sm space-y-1 mt-2 p-2 bg-muted rounded">
                            <div><strong>Lessor:</strong> {owner.lastLeaseOfRecord.lessor}</div>
                            <div><strong>Lessee:</strong> {owner.lastLeaseOfRecord.lessee}</div>
                            <div><strong>Dated:</strong> {owner.lastLeaseOfRecord.dated}</div>
                            <div><strong>Term:</strong> {owner.lastLeaseOfRecord.term}</div>
                            <div><strong>Expiration:</strong> {owner.lastLeaseOfRecord.expiration}</div>
                            <div><strong>Recorded:</strong> {owner.lastLeaseOfRecord.recorded}</div>
                            <div><strong>Document #:</strong> {owner.lastLeaseOfRecord.documentNumber}</div>
                            
                            {owner.landsConveredOnLease && owner.landsConveredOnLease.length > 0 && (
                              <div className="mt-2">
                                <strong>Lands Covered on Lease:</strong>
                                <div className="text-xs text-muted-foreground">
                                  {owner.landsConveredOnLease.map((land, i) => (
                                    <div key={i}>{land}</div>
                                  ))}
                                </div>
                                {owner.listedAcreage && (
                                  <div className="text-xs">Listed Acreage: {owner.listedAcreage}</div>
                                )}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                <TableRow className="border-t-2 font-bold">
                  <TableCell></TableCell>
                  <TableCell><strong>Total</strong></TableCell>
                  <TableCell className="text-right">100.00000000%</TableCell>
                  <TableCell className="text-right">{effectiveAcres.toFixed(8)}</TableCell>
                  <TableCell></TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Wells Section */}
        {tract.wells && tract.wells.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Well Summary</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {tract.wells.map((well, index) => (
                  <div key={index} className="p-2 bg-muted rounded text-sm">
                    {well}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Limitations */}
        <Card>
          <CardHeader>
            <CardTitle>Limitations and Exceptions</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground whitespace-pre-line">
              {tract.limitationsAndExceptions}
            </p>
            <p className="text-sm text-muted-foreground mt-4">
              <strong>Prepared by:</strong> AI Lease Check Analyzer<br/>
              <strong>Powered by:</strong> Lovable
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Legacy structured format rendering
  if (isStructuredFormat) {
    const structuredData = data as StructuredLeaseCheckData;
    
    return (
      <div className="space-y-6">
        {/* Header Actions */}
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-2xl font-bold">Oil and Gas Ownership & Leasehold Takeoff</h2>
            <p className="text-muted-foreground">
              Analysis completed for {structuredData.prospect}
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={downloadReport}>
              <FileText className="w-4 h-4 mr-2" />
              Download Report
            </Button>
            <Button variant="outline" onClick={downloadSpreadsheet}>
              <FileSpreadsheet className="w-4 h-4 mr-2" />
              Export CSV
            </Button>
            <Button onClick={onNewAnalysis}>
              <RefreshCw className="w-4 h-4 mr-2" />
              New Analysis
            </Button>
          </div>
        </div>

        {/* Summary Card */}
        <Card>
          <CardHeader>
            <CardTitle>Prospect Information</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <div className="text-sm font-medium text-muted-foreground">Legal Description</div>
                <div className="text-lg font-semibold">{structuredData.prospect}</div>
              </div>
              <div>
                <div className="text-sm font-medium text-muted-foreground">Total Acres</div>
                <div className="text-lg font-semibold">{structuredData.totalAcres}</div>
              </div>
              <div>
                <div className="text-sm font-medium text-muted-foreground">Total Owners</div>
                <div className="text-lg font-semibold">{structuredData.owners?.length || 0}</div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Ownership Table */}
        <Card>
          <CardHeader>
            <CardTitle>Mineral Ownership & Leasehold Status</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">#</TableHead>
                  <TableHead>MINERAL OWNER</TableHead>
                  <TableHead className="text-right">INTERESTS</TableHead>
                  <TableHead className="text-right">NET ACRES</TableHead>
                  <TableHead>LEASEHOLD STATUS</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {structuredData.owners?.map((owner, index) => (
                  <TableRow key={index} className="border-b">
                    <TableCell className="font-medium">{index + 1}</TableCell>
                    <TableCell>
                      <div className="font-medium">{owner.name}</div>
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {owner.interests}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {typeof owner.netAcres === 'number' ? owner.netAcres.toFixed(7) : parseFloat(owner.netAcres || '0').toFixed(7)}
                    </TableCell>
                    <TableCell>
                      <div className="space-y-2">
                        <Badge variant={getStatusBadgeVariant(owner.leaseholdStatus)}>
                          {owner.leaseholdStatus}
                        </Badge>
                        
                        {owner.lastLeaseOfRecord && (
                          <div className="text-sm space-y-1 mt-2 p-2 bg-muted rounded">
                            <div><strong>Lessor:</strong> {owner.lastLeaseOfRecord.lessor}</div>
                            <div><strong>Lessee:</strong> {owner.lastLeaseOfRecord.lessee}</div>
                            <div><strong>Dated:</strong> {owner.lastLeaseOfRecord.dated}</div>
                            <div><strong>Term:</strong> {owner.lastLeaseOfRecord.term}</div>
                            <div><strong>Expiration:</strong> {owner.lastLeaseOfRecord.expiration}</div>
                            <div><strong>Recorded:</strong> {owner.lastLeaseOfRecord.recorded}</div>
                            <div><strong>Document #:</strong> {owner.lastLeaseOfRecord.documentNumber}</div>
                            
                            {owner.landsConveredOnLease && owner.landsConveredOnLease.length > 0 && (
                              <div className="mt-2">
                                <strong>Lands Covered on Lease:</strong>
                                <div className="text-xs text-muted-foreground">
                                  {owner.landsConveredOnLease.map((land, i) => (
                                    <div key={i}>{land}</div>
                                  ))}
                                </div>
                                {owner.listedAcreage && (
                                  <div className="text-xs">Listed Acreage: {owner.listedAcreage}</div>
                                )}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                <TableRow className="border-t-2 font-bold">
                  <TableCell></TableCell>
                  <TableCell><strong>Total</strong></TableCell>
                  <TableCell className="text-right">100.00000000%</TableCell>
                  <TableCell className="text-right">{structuredData.totalAcres}</TableCell>
                  <TableCell></TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Wells Section */}
        {structuredData.wells.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Well Summary</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {structuredData.wells.map((well, index) => (
                  <div key={index} className="p-2 bg-muted rounded text-sm">
                    {well}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Limitations */}
        <Card>
          <CardHeader>
            <CardTitle>Limitations and Exceptions</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground whitespace-pre-line">
              {structuredData.limitationsAndExceptions}
            </p>
            <p className="text-sm text-muted-foreground mt-4">
              <strong>Prepared by:</strong> AI Lease Check Analyzer<br/>
              <strong>Powered by:</strong> Lovable
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Original format fallback
  const originalData = data as LeaseCheckData;
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold">Lease Check Results</h2>
          <p className="text-muted-foreground">
            Analysis completed for {originalData.prospect}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={downloadReport}>
            <FileText className="w-4 h-4 mr-2" />
            Download Report
          </Button>
          <Button variant="outline" onClick={downloadSpreadsheet}>
            <FileSpreadsheet className="w-4 h-4 mr-2" />
            Export CSV
          </Button>
          <Button onClick={onNewAnalysis}>
            <RefreshCw className="w-4 h-4 mr-2" />
            New Analysis
          </Button>
        </div>
      </div>
      
      <Card>
        <CardContent className="p-6">
          <p className="text-muted-foreground">
            This document format requires structured runsheet data for detailed analysis. 
            Please upload an Excel runsheet for the enhanced ownership analysis format.
          </p>
        </CardContent>
      </Card>
    </div>
  );
};