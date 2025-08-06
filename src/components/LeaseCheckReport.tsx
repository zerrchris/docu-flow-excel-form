import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Download, FileSpreadsheet, FileText, RefreshCw } from 'lucide-react';
import { LeaseCheckData, MineralOwner, Tract } from '@/pages/LeaseCheck';
import { useToast } from '@/hooks/use-toast';

interface LeaseCheckReportProps {
  data: LeaseCheckData;
  onNewAnalysis: () => void;
}

export const LeaseCheckReport: React.FC<LeaseCheckReportProps> = ({ data, onNewAnalysis }) => {
  const { toast } = useToast();

  const getStatusBadgeVariant = (status: string) => {
    switch (status) {
      case 'Leased':
        return 'default';
      case 'Open/Unleased':
        return 'secondary';
      case 'Expired (Potential HBP)':
        return 'destructive';
      default:
        return 'outline';
    }
  };

  const generateReportText = () => {
    const date = new Date().toLocaleDateString();
    let report = `LEASE CHECK REPORT\n`;
    report += `Index Date: ${date}\n`;
    report += `Completed Date: ${date}\n`;
    report += `Prospect: ${data.prospect}\n`;
    report += `Total Acres: ${data.totalAcres}\n\n`;

    report += `SUMMARY\n`;
    report += `Open Interests: ${data.openInterests}\n`;
    if (data.earliestExpiring) {
      report += `Earliest Expiring Lease: ${data.earliestExpiring}\n`;
    }
    report += `Unresearched Leases: ${data.unresearchedLeases}\n\n`;

    data.tracts.forEach((tract, tractIndex) => {
      report += `TRACT ${tractIndex + 1}\n`;
      report += `Legal Description: ${tract.legalDescription}\n`;
      report += `Acres: ${tract.acres}\n\n`;

      tract.owners.forEach((owner, ownerIndex) => {
        report += `MINERAL OWNER ${ownerIndex + 1}\n`;
        report += `Name: ${owner.name}\n`;
        report += `Address: ${owner.address}\n`;
        report += `Vesting Source: ${owner.vestingSource}\n`;
        report += `Status: ${owner.status}\n`;
        
        if (owner.lastLease) {
          report += `Last Lease of Record:\n`;
          report += `  Lessor: ${owner.lastLease.lessor}\n`;
          report += `  Lessee: ${owner.lastLease.lessee}\n`;
          report += `  Dated: ${owner.lastLease.dated}\n`;
          report += `  Term: ${owner.lastLease.term}\n`;
          report += `  Expiration: ${owner.lastLease.expiration}\n`;
          report += `  Recorded: ${owner.lastLease.recordedDoc}\n`;
        }
        
        report += `Pugh Clause: ${owner.pughClause}\n`;
        report += `Held by Production: ${owner.heldByProduction}\n`;
        if (owner.notes) {
          report += `Notes: ${owner.notes}\n`;
        }
        report += `\n`;
      });
      report += `\n`;
    });

    if (data.wells.length > 0) {
      report += `WELLS\n`;
      data.wells.forEach(well => {
        report += `${well}\n`;
      });
      report += `\n`;
    }

    report += `LIMITATIONS AND EXCEPTIONS\n`;
    report += `${data.limitationsAndExceptions}\n\n`;
    report += `Prepared By: AI Lease Check Analyzer, Powered by Lovable\n`;

    return report;
  };

  const generateSpreadsheetData = () => {
    const spreadsheetData: any[] = [];
    
    data.tracts.forEach(tract => {
      tract.owners.forEach(owner => {
        spreadsheetData.push({
          Tract: tract.legalDescription,
          Acres: tract.acres,
          MineralOwner: owner.name,
          Address: owner.address,
          VestingSource: owner.vestingSource,
          LeaseStatus: owner.status,
          LastLeaseDetails: owner.lastLease ? JSON.stringify(owner.lastLease) : '',
          PughClause: owner.pughClause,
          HeldByProduction: owner.heldByProduction,
          Notes: owner.notes
        });
      });
    });

    return spreadsheetData;
  };

  const downloadReport = () => {
    const reportText = generateReportText();
    const blob = new Blob([reportText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `lease-check-report-${Date.now()}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    toast({
      title: "Report Downloaded",
      description: "Lease check report has been downloaded as a text file",
    });
  };

  const downloadSpreadsheet = () => {
    const spreadsheetData = generateSpreadsheetData();
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
    a.download = `lease-check-data-${Date.now()}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    toast({
      title: "Data Exported",
      description: "Lease check data has been exported as a CSV file",
    });
  };

  return (
    <div className="space-y-6">
      {/* Header Actions */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold">Lease Check Results</h2>
          <p className="text-muted-foreground">
            Analysis completed for {data.prospect}
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
          <CardTitle>Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-primary">{data.totalAcres}</div>
              <div className="text-sm text-muted-foreground">Total Acres</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-orange-600">{data.openInterests}</div>
              <div className="text-sm text-muted-foreground">Open Interests</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-600">{data.tracts.length}</div>
              <div className="text-sm text-muted-foreground">Total Tracts</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-red-600">{data.unresearchedLeases}</div>
              <div className="text-sm text-muted-foreground">Unresearched</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tracts and Owners */}
      {data.tracts.map((tract, tractIndex) => (
        <Card key={tractIndex}>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>Tract {tractIndex + 1}: {tract.legalDescription}</span>
              <Badge variant="outline">{tract.acres} acres</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Owner</TableHead>
                  <TableHead>Address</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Last Lease</TableHead>
                  <TableHead>Production</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tract.owners.map((owner, ownerIndex) => (
                  <TableRow key={ownerIndex}>
                    <TableCell>
                      <div>
                        <div className="font-medium">{owner.name}</div>
                        <div className="text-sm text-muted-foreground">
                          {owner.vestingSource}
                        </div>
                        {owner.notes && (
                          <div className="text-sm text-blue-600 mt-1">
                            {owner.notes}
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">{owner.address}</TableCell>
                    <TableCell>
                      <Badge variant={getStatusBadgeVariant(owner.status)}>
                        {owner.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {owner.lastLease ? (
                        <div className="text-sm space-y-1">
                          <div><strong>Lessee:</strong> {owner.lastLease.lessee}</div>
                          <div><strong>Dated:</strong> {owner.lastLease.dated}</div>
                          <div><strong>Expires:</strong> {owner.lastLease.expiration}</div>
                        </div>
                      ) : (
                        <span className="text-muted-foreground">None</span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm">
                      {owner.heldByProduction}
                      {owner.pughClause !== 'No' && (
                        <div className="text-orange-600 mt-1">
                          Pugh: {owner.pughClause}
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ))}

      {/* Wells Section */}
      {data.wells.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Wells / Production</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {data.wells.map((well, index) => (
                <div key={index} className="p-2 bg-muted rounded">
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
          <p className="text-sm text-muted-foreground">
            {data.limitationsAndExceptions}
          </p>
          <p className="text-sm text-muted-foreground mt-2">
            <strong>Prepared By:</strong> AI Lease Check Analyzer, Powered by Lovable
          </p>
        </CardContent>
      </Card>
    </div>
  );
};