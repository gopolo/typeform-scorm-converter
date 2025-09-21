import { Injectable } from '@angular/core';

export interface ScormData {
  typeformUrl: string;
  title: string;
  identifier: string;
  description: string;
}

@Injectable({ providedIn: 'root' })
export class ScormService {

  getImsManifestContent(data: ScormData): string {
    return `<?xml version="1.0" standalone="no" ?>
<manifest identifier="${data.identifier}" version="1.2"
    xmlns="http://www.imsproject.org/xsd/imscp_rootv1p1p2"
    xmlns:adlcp="http://www.adlnet.org/xsd/adlcp_rootv1p2"
    xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
    xsi:schemaLocation="http://www.imsproject.org/xsd/imscp_rootv1p1p2 imscp_rootv1p1.xsd http://www.imsglobal.org/xsd/imsmd_rootv1p2p1 imsmd_rootv1p2p1.xsd http://www.adlnet.org/xsd/adlcp_rootv1p2 adlcp_rootv1p2.xsd">
    <metadata>
        <schema>ADL SCORM</schema>
        <schemaversion>1.2</schemaversion>
        <lom xmlns="http://www.imsglobal.org/xsd/imsmd_rootv1p2p1">
            <general>
                <title>
                    <langstring xml:lang="en-US">${this.escapeXml(data.title)}</langstring>
                </title>
                <description>
                    <langstring xml:lang="en-US">${this.escapeXml(data.description)}</langstring>
                </description>
            </general>
        </lom>
    </metadata>
    <organizations default="${data.identifier}_org">
        <organization identifier="${data.identifier}_org" structure="hierarchical">
            <title>${this.escapeXml(data.title)}</title>
            <item identifier="item_1" identifierref="res_1" isvisible="true">
                <title>${this.escapeXml(data.title)}</title>
            </item>
        </organization>
    </organizations>
    <resources>
        <resource identifier="res_1" type="webcontent" adlcp:scormtype="sco" href="index.html">
            <file href="index.html" />
            <file href="scorm.js" />
        </resource>
    </resources>
</manifest>`;
  }

  getIndexHtmlContent(typeformUrl: string): string {
    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>SCORM Content</title>
  <style>
    body, html { margin: 0; padding: 0; height: 100%; overflow: hidden; font-family: sans-serif; }
    iframe { border: 0; width: 100%; height: 100%; }
    #loader { display: flex; align-items: center; justify-content: center; width: 100%; height: 100%; background-color: #f0f0f0; color: #333; }
  </style>
</head>
<body>
  <div id="loader">Loading survey...</div>
  <iframe id="content-frame" style="display:none;" src="${this.escapeXml(typeformUrl)}" title="Survey Content"></iframe>
  <script src="scorm.js"></script>
  <script>
    (function() {
      var scorm = window.scorm;
      var initialized = false;

      function init() {
        if (initialized) return;
        initialized = scorm.init();
        
        var lessonStatus = scorm.get("cmi.core.lesson_status");
        if (lessonStatus !== "completed" && lessonStatus !== "passed" && lessonStatus !== "failed") {
          scorm.set("cmi.core.lesson_status", "incomplete");
          scorm.save();
        }
      }
      
      function exit() {
        if (!initialized) return;
        scorm.quit();
        initialized = false;
      }

      function handleTypeformSubmit(event) {
        if (!initialized) return;
        // Check origin for security
        if (!event.origin.includes('typeform.com')) {
          return;
        }

        try {
          var data = (typeof event.data === 'string') ? JSON.parse(event.data) : event.data;
          
          if (data && data.type === 'form-submit') {
            console.log('Typeform submitted, setting SCORM status to completed.');
            scorm.set("cmi.core.lesson_status", "completed");
            scorm.save();
          }
        } catch (e) {
          // data is not JSON or other error, ignore.
          console.warn("Could not process message from iframe:", e);
        }
      }

      var iframe = document.getElementById('content-frame');
      var loader = document.getElementById('loader');

      iframe.onload = function() {
        loader.style.display = 'none';
        iframe.style.display = 'block';
      };

      window.addEventListener('message', handleTypeformSubmit, false);
      window.addEventListener('load', init);
      window.addEventListener('beforeunload', exit);
    })();
  </script>
</body>
</html>`;
  }

  getScormJsContent(): string {
    return `(function(window) {
    'use strict';
    var scorm = {};
    window.scorm = scorm;

    var api = null;
    var isInitialized = false;

    function findAPI(win) {
        var findAPITries = 0;
        while ((win.API == null) && (win.parent != null) && (win.parent != win)) {
            findAPITries++;
            if (findAPITries > 7) {
                console.error("Error: Could not find SCORM API. Already tried 7 times.");
                return null;
            }
            win = win.parent;
        }
        return win.API;
    }

    function initAPI() {
        var win = window;
        try {
            api = findAPI(win);
            if ((api == null) && (win.opener != null) && (typeof(win.opener) != "undefined")) {
                api = findAPI(win.opener);
            }
        } catch (e) {
            console.error("Error finding SCORM API:", e);
        }

        if (api == null) {
            console.error("Unable to find SCORM API.");
        }
    }

    scorm.init = function() {
        if (isInitialized) return true;
        initAPI();
        if (api) {
            isInitialized = (api.LMSInitialize("") === "true");
            if (!isInitialized) {
                console.error("LMSInitialize failed.");
            }
        }
        return isInitialized;
    };

    scorm.quit = function() {
        if (!isInitialized) return true;
        if (api) {
            api.LMSFinish("");
        }
        isInitialized = false;
        return true;
    };

    scorm.get = function(param) {
        if (!isInitialized) return "";
        var value = "";
        if (api) {
            value = api.LMSGetValue(param);
            var err = api.LMSGetLastError();
            if (err !== "0") {
                console.error("LMSGetValue(" + param + ") failed. Error code: " + err);
            }
        }
        return value;
    };

    scorm.set = function(param, value) {
        if (!isInitialized) return false;
        var success = false;
        if (api) {
            success = (api.LMSSetValue(param, value) === "true");
            if (!success) {
                var err = api.LMSGetLastError();
                console.error("LMSSetValue(" + param + ", " + value + ") failed. Error code: " + err);
            }
        }
        return success;
    };

    scorm.save = function() {
        if (!isInitialized) return false;
        var success = false;
        if (api) {
            success = (api.LMSCommit("") === "true");
            if (!success) {
                var err = api.LMSGetLastError();
                console.error("LMSCommit failed. Error code: " + err);
            }
        }
        return success;
    };
})(window);`;
  }
  
  getXsdFileContents() {
    return {
        adlcp: `<?xml version="1.0" encoding="UTF-8"?>
<xsd:schema targetNamespace="http://www.adlnet.org/xsd/adlcp_rootv1p2" xmlns="http://www.adlnet.org/xsd/adlcp_rootv1p2" xmlns:xsd="http://www.w3.org/2001/XMLSchema" elementFormDefault="qualified" attributeFormDefault="unqualified">
<xsd:element name="location" type="locationType"/>
<xsd:element name="lom" type="lomType"/>
<xsd:attribute name="scormtype" type="scormTypeType"/>
<xsd:simpleType name="scormTypeType">
<xsd:restriction base="xsd:string">
<xsd:enumeration value="sco"/>
<xsd:enumeration value="asset"/>
</xsd:restriction>
</xsd:simpleType>
<xsd:complexType name="locationType">
<xsd:simpleContent>
<xsd:extension base="xsd:string"/>
</xsd:simpleContent>
</xsd:complexType>
<xsd:complexType name="lomType">
<xsd:sequence>
<xsd:any namespace="##any" processContents="lax" minOccurs="0" maxOccurs="unbounded"/>
</xsd:sequence>
</xsd:complexType>
</xsd:schema>`,
        ims_xml: `<?xml version = "1.0" encoding = "UTF-8"?>
<xsd:schema xmlns:xsd = "http://www.w3.org/2001/XMLSchema"
   targetNamespace = "http://www.w3.org/XML/1998/namespace"
   xmlns:xml = "http://www.w3.org/XML/1998/namespace"
   elementFormDefault="qualified">
   <xsd:attribute name = "lang" type = "xsd:language"/>
   <xsd:attribute name = "space">
      <xsd:simpleType>
         <xsd:restriction base = "xsd:NCName">
            <xsd:enumeration value = "default"/>
            <xsd:enumeration value = "preserve"/>
         </xsd:restriction>
      </xsd:simpleType>
   </xsd:attribute>
   <xsd:attributeGroup name = "specialAttrs">
      <xsd:attribute ref = "xml:lang"/>
      <xsd:attribute ref = "xml:space"/>
   </xsd:attributeGroup>
</xsd:schema>`,
        imscp: `<?xml version="1.0" encoding="UTF-8"?>
<xsd:schema targetNamespace="http://www.imsproject.org/xsd/imscp_rootv1p1p2" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns="http://www.imsproject.org/xsd/imscp_rootv1p1p2" xmlns:xml="http://www.w3.org/XML/1998/namespace" elementFormDefault="qualified" attributeFormDefault="unqualified">
<xsd:import namespace="http://www.w3.org/XML/1998/namespace" schemaLocation="ims_xml.xsd"/>
<xsd:element name="manifest" type="manifestType"/>
<xsd:element name="metadata" type="metadataType"/>
<xsd:element name="organizations" type="organizationsType"/>
<xsd:element name="resources" type="resourcesType"/>
<xsd:complexType name="manifestType">
<xsd:sequence>
<xsd:element ref="metadata" minOccurs="0"/>
<xsd:element ref="organizations"/>
<xsd:element ref="resources"/>
<xsd:element ref="manifest" minOccurs="0" maxOccurs="unbounded"/>
</xsd:sequence>
<xsd:attribute name="identifier" type="xsd:ID" use="required"/>
<xsd:attribute name="version" type="xsd:string" use="optional"/>
<xsd:attribute ref="xml:base" use="optional"/>
<xsd:anyAttribute namespace="##other" processContents="lax"/>
</xsd:complexType>
<xsd:complexType name="metadataType">
<xsd:sequence>
<xsd:element name="schema" type="xsd:string" minOccurs="0"/>
<xsd:element name="schemaversion" type="xsd:string" minOccurs="0"/>
<xsd:any namespace="##other" processContents="lax" minOccurs="0" maxOccurs="unbounded"/>
</xsd:sequence>
</xsd:complexType>
<xsd:complexType name="organizationsType">
<xsd:sequence>
<xsd:element name="organization" type="organizationType" maxOccurs="unbounded"/>
</xsd:sequence>
<xsd:attribute name="default" type="xsd:IDREF" use="required"/>
</xsd:complexType>
<xsd:complexType name="organizationType">
<xsd:sequence>
<xsd:element name="title" type="xsd:string"/>
<xsd:element name="item" type="itemType" maxOccurs="unbounded"/>
<xsd:element name="metadata" type="metadataType" minOccurs="0"/>
</xsd:sequence>
<xsd:attribute name="identifier" type="xsd:ID" use="required"/>
<xsd:attribute name="structure" type="xsd:string" use="optional" default="hierarchical"/>
</xsd:complexType>
<xsd:complexType name="itemType">
<xsd:sequence>
<xsd:element name="title" type="xsd:string"/>
<xsd:element name="item" type="itemType" minOccurs="0" maxOccurs="unbounded"/>
<xsd:element name="metadata" type="metadataType" minOccurs="0"/>
</xsd:sequence>
<xsd:attribute name="identifier" type="xsd:ID" use="required"/>
<xsd:attribute name="identifierref" type="xsd:IDREF" use="optional"/>
<xsd:attribute name="isvisible" type="xsd:boolean" use="optional" default="true"/>
<xsd:attribute name="parameters" type="xsd:string" use="optional"/>
<xsd:anyAttribute namespace="##other" processContents="lax"/>
</xsd:complexType>
<xsd:complexType name="resourcesType">
<xsd:sequence>
<xsd:element name="resource" type="resourceType" maxOccurs="unbounded"/>
</xsd:sequence>
<xsd:attribute ref="xml:base" use="optional"/>
</xsd:complexType>
<xsd:complexType name="resourceType">
<xsd:sequence>
<xsd:element name="metadata" type="metadataType" minOccurs="0"/>
<xsd:element name="file" type="fileType" maxOccurs="unbounded"/>
<xsd:element name="dependency" type="dependencyType" minOccurs="0" maxOccurs="unbounded"/>
</xsd:sequence>
<xsd:attribute name="identifier" type="xsd:ID" use="required"/>
<xsd:attribute name="type" type="xsd:string" use="required"/>
<xsd:attribute ref="xml:base" use="optional"/>
<xsd:attribute name="href" type="xsd:string" use="optional"/>
<xsd:anyAttribute namespace="##other" processContents="lax"/>
</xsd:complexType>
<xsd:complexType name="fileType">
<xsd:sequence>
<xsd:element name="metadata" type="metadataType" minOccurs="0"/>
</xsd:sequence>
<xsd:attribute name="href" type="xsd:string" use="required"/>
</xsd:complexType>
<xsd:complexType name="dependencyType">
<xsd:attribute name="identifierref" type="xsd:IDREF" use="required"/>
</xsd:complexType>
</xsd:schema>`,
        imsmd: `<?xml version="1.0" encoding="UTF-8"?>
<xsd:schema targetNamespace="http://www.imsglobal.org/xsd/imsmd_rootv1p2p1" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns="http://www.imsglobal.org/xsd/imsmd_rootv1p2p1" elementFormDefault="qualified">
<xsd:element name="lom" type="lomType"/>
<xsd:complexType name="lomType">
<xsd:sequence>
<xsd:element name="general" type="generalType" minOccurs="0"/>
<xsd:element name="lifecycle" type="lifecycleType" minOccurs="0"/>
<xsd:element name="metametadata" type="metametadataType" minOccurs="0"/>
<xsd:element name="technical" type="technicalType" minOccurs="0"/>
<xsd:element name="educational" type="educationalType" minOccurs="0"/>
<xsd:element name="rights" type="rightsType" minOccurs="0"/>
<xsd:element name="relation" type="relationType" minOccurs="0" maxOccurs="unbounded"/>
<xsd:element name="annotation" type="annotationType" minOccurs="0" maxOccurs="unbounded"/>
<xsd:element name="classification" type="classificationType" minOccurs="0" maxOccurs="unbounded"/>
</xsd:sequence>
</xsd:complexType>
<xsd:complexType name="generalType">
<xsd:sequence>
<xsd:element name="identifier" type="identifierType" minOccurs="0" maxOccurs="unbounded"/>
<xsd:element name="title" type="langstringType" minOccurs="0"/>
<xsd:element name="catalogentry" type="catalogentryType" minOccurs="0" maxOccurs="unbounded"/>
<xsd:element name="language" type="xsd:language" minOccurs="0" maxOccurs="unbounded"/>
<xsd:element name="description" type="langstringType" minOccurs="0" maxOccurs="unbounded"/>
<xsd:element name="keyword" type="langstringType" minOccurs="0" maxOccurs="unbounded"/>
<xsd:element name="coverage" type="langstringType" minOccurs="0" maxOccurs="unbounded"/>
<xsd:element name="structure" type="vocabularyType" minOccurs="0"/>
<xsd:element name="aggregationlevel" type="vocabularyType" minOccurs="0"/>
</xsd:sequence>
</xsd:complexType>
<xsd:complexType name="lifecycleType">
<xsd:sequence>
<xsd:element name="version" type="langstringType" minOccurs="0"/>
<xsd:element name="status" type="vocabularyType" minOccurs="0"/>
<xsd:element name="contribute" type="contributeType" minOccurs="0" maxOccurs="unbounded"/>
</xsd:sequence>
</xsd:complexType>
<xsd:complexType name="metametadataType">
<xsd:sequence>
<xsd:element name="identifier" type="identifierType" minOccurs="0" maxOccurs="unbounded"/>
<xsd:element name="catalogentry" type="catalogentryType" minOccurs="0" maxOccurs="unbounded"/>
<xsd:element name="contribute" type="contributeType" minOccurs="0" maxOccurs="unbounded"/>
<xsd:element name="metadatascheme" type="xsd:string" minOccurs="0" maxOccurs="unbounded"/>
<xsd:element name="language" type="xsd:language" minOccurs="0"/>
</xsd:sequence>
</xsd:complexType>
<xsd:complexType name="technicalType">
<xsd:sequence>
<xsd:element name="format" type="xsd:string" minOccurs="0" maxOccurs="unbounded"/>
<xsd:element name="size" type="xsd:string" minOccurs="0"/>
<xsd:element name="location" type="xsd:string" minOccurs="0" maxOccurs="unbounded"/>
<xsd:element name="requirement" type="requirementType" minOccurs="0" maxOccurs="unbounded"/>
<xsd:element name="installationremarks" type="langstringType" minOccurs="0"/>
<xsd:element name="otherplatformrequirements" type="langstringType" minOccurs="0"/>
<xsd:element name="duration" type="xsd:string" minOccurs="0"/>
</xsd:sequence>
</xsd:complexType>
<xsd:complexType name="educationalType">
<xsd:sequence>
<xsd:element name="interactivitytype" type="vocabularyType" minOccurs="0"/>
<xsd:element name="learningresourcetype" type="vocabularyType" minOccurs="0" maxOccurs="unbounded"/>
<xsd:element name="interactivitylevel" type="vocabularyType" minOccurs="0"/>
<xsd:element name="semanticdensity" type="vocabularyType" minOccurs="0"/>
<xsd:element name="intendedenduserrole" type="vocabularyType" minOccurs="0" maxOccurs="unbounded"/>
<xsd:element name="context" type="vocabularyType" minOccurs="0" maxOccurs="unbounded"/>
<xsd:element name="typicalagerange" type="langstringType" minOccurs="0" maxOccurs="unbounded"/>
<xsd:element name="difficulty" type="vocabularyType" minOccurs="0"/>
<xsd:element name="typicallearningtime" type="xsd:string" minOccurs="0"/>
<xsd:element name="description" type="langstringType" minOccurs="0"/>
<xsd:element name="language" type="xsd:language" minOccurs="0" maxOccurs="unbounded"/>
</xsd:sequence>
</xsd:complexType>
<xsd:complexType name="rightsType">
<xsd:sequence>
<xsd:element name="cost" type="vocabularyType" minOccurs="0"/>
<xsd:element name="copyrightandotherrestrictions" type="vocabularyType" minOccurs="0"/>
<xsd:element name="description" type="langstringType" minOccurs="0"/>
</xsd:sequence>
</xsd:complexType>
<xsd:complexType name="relationType">
<xsd:sequence>
<xsd:element name="kind" type="vocabularyType" minOccurs="0"/>
<xsd:element name="resource" type="resourceType" minOccurs="0"/>
</xsd:sequence>
</xsd:complexType>
<xsd:complexType name="annotationType">
<xsd:sequence>
<xsd:element name="person" type="xsd:string" minOccurs="0"/>
<xsd:element name="date" type="xsd:string" minOccurs="0"/>
<xsd:element name="description" type="langstringType" minOccurs="0"/>
</xsd:sequence>
</xsd:complexType>
<xsd:complexType name="classificationType">
<xsd:sequence>
<xsd:element name="purpose" type="vocabularyType" minOccurs="0"/>
<xsd:element name="taxonpath" type="taxonpathType" minOccurs="0" maxOccurs="unbounded"/>
<xsd:element name="description" type="langstringType" minOccurs="0"/>
<xsd:element name="keyword" type="langstringType" minOccurs="0" maxOccurs="unbounded"/>
</xsd:sequence>
</xsd:complexType>
<xsd:complexType name="langstringType">
<xsd:sequence>
<xsd:element name="langstring" type="xsd:string" minOccurs="0" maxOccurs="unbounded"/>
</xsd:sequence>
</xsd:complexType>
<xsd:complexType name="identifierType">
<xsd:sequence>
<xsd:element name="catalog" type="xsd:string" minOccurs="0"/>
<xsd:element name="entry" type="xsd:string" minOccurs="0"/>
</xsd:sequence>
</xsd:complexType>
<xsd:complexType name="catalogentryType">
<xsd:sequence>
<xsd:element name="catalog" type="xsd:string"/>
<xsd:element name="entry" type="langstringType"/>
</xsd:sequence>
</xsd:complexType>
<xsd:complexType name="contributeType">
<xsd:sequence>
<xsd:element name="role" type="vocabularyType"/>
<xsd:element name="centity" type="xsd:string" maxOccurs="unbounded"/>
<xsd:element name="date" type="xsd:string" minOccurs="0"/>
</xsd:sequence>
</xsd:complexType>
<xsd:complexType name="vocabularyType">
<xsd:sequence>
<xsd:element name="source" type="langstringType"/>
<xsd:element name="value" type="langstringType"/>
</xsd:sequence>
</xsd:complexType>
<xsd:complexType name="requirementType">
<xsd:sequence>
<xsd:element name="type" type="vocabularyType"/>
<xsd:element name="name" type="vocabularyType"/>
<xsd:element name="minimumversion" type="xsd:string"/>
<xsd:element name="maximumversion" type="xsd:string" minOccurs="0"/>
</xsd:sequence>
</xsd:complexType>
<xsd:complexType name="resourceType">
<xsd:sequence>
<xsd:element name="identifier" type="identifierType" minOccurs="0" maxOccurs="unbounded"/>
<xsd:element name="description" type="langstringType" minOccurs="0" maxOccurs="unbounded"/>
</xsd:sequence>
</xsd:complexType>
<xsd:complexType name="taxonpathType">
<xsd:sequence>
<xsd:element name="source" type="langstringType"/>
<xsd:element name="taxon" type="taxonType" maxOccurs="unbounded"/>
</xsd:sequence>
</xsd:complexType>
<xsd:complexType name="taxonType">
<xsd:sequence>
<xsd:element name="id" type="xsd:string"/>
<xsd:element name="entry" type="langstringType"/>
</xsd:sequence>
</xsd:complexType>
</xsd:schema>`
    };
  }
  
  private escapeXml(unsafe: string): string {
    return unsafe.replace(/[<>&'"]/g, (c) => {
        switch (c) {
            case '<': return '&lt;';
            case '>': return '&gt;';
            case '&': return '&amp;';
            case '\'': return '&apos;';
            case '"': return '&quot;';
        }
        return c;
    });
  }
}
