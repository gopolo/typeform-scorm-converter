
import { Component, ChangeDetectionStrategy, signal, computed, inject, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ScormService, ScormData } from './services/scorm.service';

declare var JSZip: any;
declare var saveAs: any;

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppComponent {
  private scormService = inject(ScormService);

  // Form input signals
  typeformUrl = signal('');
  courseTitle = signal('');
  courseIdentifier = signal('');
  courseDescription = signal('');

  // UI state signals
  isGenerating = signal(false);
  generatedPackageName = signal<string | null>(null);

  isIdentifierManuallyEdited = signal(false);

  // Computed signal for form validity
  isFormValid = computed(() => {
    const urlPattern = /^https:\/\/.*\.typeform\.com\/.+/;
    return urlPattern.test(this.typeformUrl()) && 
           this.courseTitle().length > 3 && 
           this.courseIdentifier().length > 3 && 
           this.courseDescription().length > 3;
  });

  // Effect to auto-generate identifier from title
  constructor() {
    effect(() => {
      if (!this.isIdentifierManuallyEdited()) {
        const title = this.courseTitle();
        const identifier = 'com.scorm.wrapper.' + title
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, '');
        this.courseIdentifier.set(identifier);
      }
    }, { allowSignalWrites: true });
  }

  onIdentifierInput(): void {
    this.isIdentifierManuallyEdited.set(true);
  }

  async generateScormPackage(): Promise<void> {
    if (!this.isFormValid()) {
      return;
    }

    this.isGenerating.set(true);
    this.generatedPackageName.set(null);

    const scormData: ScormData = {
      typeformUrl: this.typeformUrl(),
      title: this.courseTitle(),
      identifier: this.courseIdentifier(),
      description: this.courseDescription()
    };
    
    // Allow UI to update before blocking with zip generation
    await new Promise(resolve => setTimeout(resolve, 50));

    try {
      const zip = new JSZip();

      // Add main files
      zip.file('imsmanifest.xml', this.scormService.getImsManifestContent(scormData));
      zip.file('index.html', this.scormService.getIndexHtmlContent(scormData.typeformUrl));
      zip.file('scorm.js', this.scormService.getScormJsContent());

      // Add XSD files
      const xsdFiles = this.scormService.getXsdFileContents();
      zip.file('adlcp_rootv1p2.xsd', xsdFiles.adlcp);
      zip.file('ims_xml.xsd', xsdFiles.ims_xml);
      zip.file('imscp_rootv1p1.xsd', xsdFiles.imscp);
      zip.file('imsmd_rootv1p2p1.xsd', xsdFiles.imsmd);
      
      const zipName = `${scormData.identifier}.zip`;
      
      const content = await zip.generateAsync({ type: 'blob' });
      saveAs(content, zipName);
      
      this.generatedPackageName.set(zipName);
    } catch (error) {
      console.error('Error generating SCORM package:', error);
      // Here you could set an error signal to show a message to the user
    } finally {
      this.isGenerating.set(false);
    }
  }
}
